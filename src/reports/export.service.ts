import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { ReportData, PostCycleSummary } from './report.service';

/**
 * Export service for generating PDF and XLSX reports.
 * 
 * Requirements: 11.2, 11.4
 * Both exports must complete within 30 seconds for 12-month datasets.
 */
export class ExportService {
  /**
   * Exports report data to PDF format using pdfkit.
   * 
   * Requirements: 11.2, 11.4
   */
  async exportPDF(reportData: ReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        // Title
        doc.fontSize(20).text('Exam Incident Report', { align: 'center' });
        doc.moveDown();

        // Metadata
        doc.fontSize(10).text(`Generated: ${reportData.generatedAt.toLocaleString()}`, {
          align: 'right',
        });
        doc.moveDown();

        // Filters section
        if (Object.keys(reportData.filters).length > 0) {
          doc.fontSize(14).text('Report Filters', { underline: true });
          doc.fontSize(10);
          if (reportData.filters.startDate) {
            doc.text(`Start Date: ${reportData.filters.startDate.toLocaleDateString()}`);
          }
          if (reportData.filters.endDate) {
            doc.text(`End Date: ${reportData.filters.endDate.toLocaleDateString()}`);
          }
          if (reportData.filters.examFieldId) {
            doc.text(`Exam Field ID: ${reportData.filters.examFieldId}`);
          }
          if (reportData.filters.incidentTypeId) {
            doc.text(`Incident Type ID: ${reportData.filters.incidentTypeId}`);
          }
          if (reportData.filters.orgId) {
            doc.text(`Organization ID: ${reportData.filters.orgId}`);
          }
          doc.moveDown();
        }

        // Summary section
        doc.fontSize(14).text('Summary', { underline: true });
        doc.fontSize(10);
        doc.text(`Total Incidents: ${reportData.summary.totalIncidents}`);
        doc.text(`Resolved Incidents: ${reportData.summary.resolvedIncidents}`);
        doc.text(
          `Average Resolution Time: ${
            reportData.summary.avgResolutionTimeMinutes
              ? `${Math.round(reportData.summary.avgResolutionTimeMinutes)} minutes`
              : 'N/A'
          }`,
        );
        doc.text(`High Priority Incidents: ${reportData.summary.highPriorityCount}`);
        doc.moveDown();

        // Metrics by Type and Organization
        doc.fontSize(14).text('Metrics by Incident Type and Organization', { underline: true });
        doc.fontSize(9);

        if (reportData.metrics.length > 0) {
          // Table headers
          const tableTop = doc.y;
          const colWidths = [120, 100, 60, 60, 80, 80];
          const headers = [
            'Incident Type',
            'Organization',
            'Total',
            'Resolved',
            'Avg Time (min)',
            '% On Time',
          ];

          let x = 50;
          headers.forEach((header, i) => {
            doc.text(header, x, tableTop, { width: colWidths[i], continued: false });
            x += colWidths[i];
          });

          doc.moveDown(0.5);

          // Table rows
          reportData.metrics.forEach((metric) => {
            if (doc.y > 700) {
              doc.addPage();
            }

            x = 50;
            const rowY = doc.y;

            doc.text(metric.incidentTypeName, x, rowY, {
              width: colWidths[0],
              continued: false,
            });
            x += colWidths[0];

            doc.text(metric.orgName ?? 'N/A', x, rowY, { width: colWidths[1], continued: false });
            x += colWidths[1];

            doc.text(metric.totalIncidents.toString(), x, rowY, {
              width: colWidths[2],
              continued: false,
            });
            x += colWidths[2];

            doc.text(metric.resolvedIncidents.toString(), x, rowY, {
              width: colWidths[3],
              continued: false,
            });
            x += colWidths[3];

            doc.text(
              metric.avgTimeToResolveMinutes
                ? Math.round(metric.avgTimeToResolveMinutes).toString()
                : 'N/A',
              x,
              rowY,
              { width: colWidths[4], continued: false },
            );
            x += colWidths[4];

            doc.text(`${metric.percentResolvedWithinThreshold}%`, x, rowY, {
              width: colWidths[5],
              continued: false,
            });

            doc.moveDown(0.5);
          });
        } else {
          doc.text('No metrics available for the selected filters.');
        }

        doc.moveDown();

        // Disruption by Exam Field
        if (doc.y > 650) {
          doc.addPage();
        }

        doc.fontSize(14).text('Disruption by Exam Field', { underline: true });
        doc.fontSize(9);

        if (reportData.disruption.length > 0) {
          const tableTop = doc.y;
          const colWidths = [150, 80, 100, 80];
          const headers = ['Exam Field', 'Total', 'Avg Disruption (min)', 'High Priority'];

          let x = 50;
          headers.forEach((header, i) => {
            doc.text(header, x, tableTop, { width: colWidths[i], continued: false });
            x += colWidths[i];
          });

          doc.moveDown(0.5);

          reportData.disruption.forEach((field) => {
            if (doc.y > 700) {
              doc.addPage();
            }

            x = 50;
            const rowY = doc.y;

            doc.text(field.examFieldName, x, rowY, { width: colWidths[0], continued: false });
            x += colWidths[0];

            doc.text(field.totalIncidents.toString(), x, rowY, {
              width: colWidths[1],
              continued: false,
            });
            x += colWidths[1];

            doc.text(
              field.avgDisruptionMinutes
                ? Math.round(field.avgDisruptionMinutes).toString()
                : 'N/A',
              x,
              rowY,
              { width: colWidths[2], continued: false },
            );
            x += colWidths[2];

            doc.text(field.highPriorityCount.toString(), x, rowY, {
              width: colWidths[3],
              continued: false,
            });

            doc.moveDown(0.5);
          });
        } else {
          doc.text('No disruption data available for the selected filters.');
        }

        // Finalize PDF
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Exports report data to XLSX format using exceljs.
   * 
   * Requirements: 11.2, 11.4
   */
  async exportXLSX(reportData: ReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ];

    summarySheet.addRows([
      { metric: 'Generated At', value: reportData.generatedAt.toLocaleString() },
      { metric: 'Total Incidents', value: reportData.summary.totalIncidents },
      { metric: 'Resolved Incidents', value: reportData.summary.resolvedIncidents },
      {
        metric: 'Average Resolution Time (minutes)',
        value: reportData.summary.avgResolutionTimeMinutes
          ? Math.round(reportData.summary.avgResolutionTimeMinutes)
          : 'N/A',
      },
      { metric: 'High Priority Incidents', value: reportData.summary.highPriorityCount },
    ]);

    // Add filters if present
    if (Object.keys(reportData.filters).length > 0) {
      summarySheet.addRow({ metric: '', value: '' }); // Empty row
      summarySheet.addRow({ metric: 'Filters Applied', value: '' });

      if (reportData.filters.startDate) {
        summarySheet.addRow({
          metric: 'Start Date',
          value: reportData.filters.startDate.toLocaleDateString(),
        });
      }
      if (reportData.filters.endDate) {
        summarySheet.addRow({
          metric: 'End Date',
          value: reportData.filters.endDate.toLocaleDateString(),
        });
      }
      if (reportData.filters.examFieldId) {
        summarySheet.addRow({ metric: 'Exam Field ID', value: reportData.filters.examFieldId });
      }
      if (reportData.filters.incidentTypeId) {
        summarySheet.addRow({
          metric: 'Incident Type ID',
          value: reportData.filters.incidentTypeId,
        });
      }
      if (reportData.filters.orgId) {
        summarySheet.addRow({ metric: 'Organization ID', value: reportData.filters.orgId });
      }
    }

    // Style the header row
    summarySheet.getRow(1).font = { bold: true };

    // Metrics sheet
    const metricsSheet = workbook.addWorksheet('Metrics by Type & Org');
    metricsSheet.columns = [
      { header: 'Incident Type', key: 'incidentTypeName', width: 30 },
      { header: 'Organization', key: 'orgName', width: 25 },
      { header: 'Total Incidents', key: 'totalIncidents', width: 15 },
      { header: 'Resolved', key: 'resolvedIncidents', width: 15 },
      { header: 'Avg Time (min)', key: 'avgTimeToResolveMinutes', width: 15 },
      { header: '% On Time', key: 'percentResolvedWithinThreshold', width: 15 },
    ];

    reportData.metrics.forEach((metric) => {
      metricsSheet.addRow({
        incidentTypeName: metric.incidentTypeName,
        orgName: metric.orgName ?? 'N/A',
        totalIncidents: metric.totalIncidents,
        resolvedIncidents: metric.resolvedIncidents,
        avgTimeToResolveMinutes: metric.avgTimeToResolveMinutes
          ? Math.round(metric.avgTimeToResolveMinutes)
          : 'N/A',
        percentResolvedWithinThreshold: `${metric.percentResolvedWithinThreshold}%`,
      });
    });

    metricsSheet.getRow(1).font = { bold: true };

    // Disruption sheet
    const disruptionSheet = workbook.addWorksheet('Disruption by Field');
    disruptionSheet.columns = [
      { header: 'Exam Field', key: 'examFieldName', width: 30 },
      { header: 'Total Incidents', key: 'totalIncidents', width: 15 },
      { header: 'Avg Disruption (min)', key: 'avgDisruptionMinutes', width: 20 },
      { header: 'High Priority Count', key: 'highPriorityCount', width: 20 },
    ];

    reportData.disruption.forEach((field) => {
      disruptionSheet.addRow({
        examFieldName: field.examFieldName,
        totalIncidents: field.totalIncidents,
        avgDisruptionMinutes: field.avgDisruptionMinutes
          ? Math.round(field.avgDisruptionMinutes)
          : 'N/A',
        highPriorityCount: field.highPriorityCount,
      });
    });

    disruptionSheet.getRow(1).font = { bold: true };

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Exports post-cycle summary to PDF format.
   */
  async exportPostCycleSummaryPDF(summary: PostCycleSummary): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        // Title
        doc.fontSize(20).text('Post-Exam-Cycle Summary Report', { align: 'center' });
        doc.moveDown();

        // Overall metrics
        doc.fontSize(14).text('Overall Metrics', { underline: true });
        doc.fontSize(10);
        doc.text(
          `Average Resolution Time: ${
            summary.avgResolutionTimeMinutes
              ? `${Math.round(summary.avgResolutionTimeMinutes)} minutes`
              : 'N/A'
          }`,
        );
        doc.moveDown();

        // Incidents per field
        doc.fontSize(14).text('Incidents per Exam Field', { underline: true });
        doc.fontSize(9);

        if (summary.incidentsPerField.length > 0) {
          const tableTop = doc.y;
          const colWidths = [300, 100];
          const headers = ['Exam Field', 'Incident Count'];

          let x = 50;
          headers.forEach((header, i) => {
            doc.text(header, x, tableTop, { width: colWidths[i], continued: false });
            x += colWidths[i];
          });

          doc.moveDown(0.5);

          summary.incidentsPerField.forEach((field) => {
            if (doc.y > 700) {
              doc.addPage();
            }

            x = 50;
            const rowY = doc.y;

            doc.text(field.examFieldName, x, rowY, { width: colWidths[0], continued: false });
            x += colWidths[0];

            doc.text(field.incidentCount.toString(), x, rowY, {
              width: colWidths[1],
              continued: false,
            });

            doc.moveDown(0.5);
          });
        } else {
          doc.text('No incident data available.');
        }

        doc.moveDown();

        // Recurring problems
        if (doc.y > 650) {
          doc.addPage();
        }

        doc.fontSize(14).text('Recurring Problem Areas', { underline: true });
        doc.fontSize(9);

        if (summary.recurringProblems.length > 0) {
          const tableTop = doc.y;
          const colWidths = [120, 120, 60];
          const headers = ['Incident Type', 'Exam Field', 'Frequency'];

          let x = 50;
          headers.forEach((header, i) => {
            doc.text(header, x, tableTop, { width: colWidths[i], continued: false });
            x += colWidths[i];
          });

          doc.moveDown(0.5);

          summary.recurringProblems.forEach((problem) => {
            if (doc.y > 700) {
              doc.addPage();
            }

            x = 50;
            const rowY = doc.y;

            doc.text(problem.incidentTypeName, x, rowY, { width: colWidths[0], continued: false });
            x += colWidths[0];

            doc.text(problem.examFieldName, x, rowY, { width: colWidths[1], continued: false });
            x += colWidths[1];

            doc.text(problem.frequency.toString(), x, rowY, {
              width: colWidths[2],
              continued: false,
            });

            doc.moveDown(0.5);
          });
        } else {
          doc.text('No recurring problems identified (frequency threshold: 3+).');
        }

        // Finalize PDF
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Exports post-cycle summary to XLSX format.
   */
  async exportPostCycleSummaryXLSX(summary: PostCycleSummary): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ];

    summarySheet.addRows([
      {
        metric: 'Average Resolution Time (minutes)',
        value: summary.avgResolutionTimeMinutes
          ? Math.round(summary.avgResolutionTimeMinutes)
          : 'N/A',
      },
    ]);

    summarySheet.getRow(1).font = { bold: true };

    // Incidents per field sheet
    const fieldSheet = workbook.addWorksheet('Incidents per Field');
    fieldSheet.columns = [
      { header: 'Exam Field', key: 'examFieldName', width: 30 },
      { header: 'Incident Count', key: 'incidentCount', width: 15 },
    ];

    summary.incidentsPerField.forEach((field) => {
      fieldSheet.addRow({
        examFieldName: field.examFieldName,
        incidentCount: field.incidentCount,
      });
    });

    fieldSheet.getRow(1).font = { bold: true };

    // Recurring problems sheet
    const problemsSheet = workbook.addWorksheet('Recurring Problems');
    problemsSheet.columns = [
      { header: 'Incident Type', key: 'incidentTypeName', width: 30 },
      { header: 'Exam Field', key: 'examFieldName', width: 30 },
      { header: 'Frequency', key: 'frequency', width: 15 },
    ];

    summary.recurringProblems.forEach((problem) => {
      problemsSheet.addRow({
        incidentTypeName: problem.incidentTypeName,
        examFieldName: problem.examFieldName,
        frequency: problem.frequency,
      });
    });

    problemsSheet.getRow(1).font = { bold: true };

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

export const exportService = new ExportService();
export default ExportService;
