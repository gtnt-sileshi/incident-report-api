# Requirements Document

## Introduction

The Exam Incident & Support Portal is a secure, centralized incident management system that modernizes how exam-related problems are reported, tracked, and resolved across Addis Ababa's national exam fields. Supported by the Addis Ababa Innovation and Technology Development Bureau (ITDB), the system replaces the current fragmented, phone- and Telegram-based reporting with a structured digital workflow.

The system covers 80–100 exam fields in Addis Ababa, each serving approximately 2,500–3,000 students per major exam cycle. It connects multiple organizations — IT representatives in the field, ITDB staff, Ministry of Education officials, Ethio Telecom, ELPA, Security Police, and others — through two dedicated components: a single Android mobile app for field IT representatives, and one unified web portal that all other roles access with role- and organization-based views. The system is deployed on-premises at the Bureau's data center.

---

## Glossary

- **Portal**: The Exam Incident & Support Portal system as a whole.
- **Web_Portal**: The single, unified browser-based application accessed by all non-field roles. Role-based access control determines what each user sees and can do within the Web_Portal.
- **Mobile_App**: The Android application used by IT_Representatives to report incidents from exam fields.
- **IT_Representative**: A field-level staff member assigned to one or more exam centers who uses the Mobile_App to report incidents. Each IT_Representative is registered with a Device_ID.
- **Bureau_Staff**: A designated employee of ITDB who uses the Web_Portal to triage, assign, and resolve incidents.
- **Organization_Admin**: A user with administrative privileges scoped to a single Organization, responsible for creating and managing users within that Organization.
- **Super_Admin**: An ITDB-level administrator who can manage all Organizations, all users, and all system-wide configuration.
- **ITDB**: The Addis Ababa Innovation and Technology Development Bureau — the central coordinating body that can view and act on all incidents.
- **MoE**: The Ministry of Education — federal oversight body with read-only monitoring access.
- **AA_Education_Bureau**: The Addis Ababa Education Bureau — city-level coordination body with read-only monitoring access.
- **Ethio_Telecom**: The telecommunications provider responsible for resolving network-related incidents assigned to them.
- **ELPA**: The Ethiopian Electric Power Authority responsible for resolving power-related incidents assigned to them.
- **Security_Police**: The security/police body responsible for resolving security-related incidents assigned to them.
- **Organization**: Any participating body registered in the system (e.g., ITDB, MoE, AA_Education_Bureau, Ethio_Telecom, ELPA, Security_Police, or any future body added at runtime). Each Organization has its own users and Organization_Admin.
- **Routing_Rule**: A configurable rule, managed by a Super_Admin, that maps an Incident_Type to a suggested or automatic Assigned_Body (Organization or specific user).
- **Incident**: A structured record of an exam-related problem reported from an exam field, including type, priority, status, description, and evidence.
- **Exam_Field**: One of the 80–100 designated exam venues in Addis Ababa where national exams are conducted.
- **Device_ID**: The unique hardware identifier of an Android device used to verify that only pre-registered devices can access the Mobile_App.
- **Exam_Center_Assignment**: The association between an IT_Representative (and their Device_ID) and one or more Exam_Fields they are authorized to report incidents for.
- **QR_Credential**: A unique, scannable QR code issued to each IT_Representative (and optionally other field staff) that encodes their identity, Organization, Exam_Center_Assignment, and access status.
- **Incident_Type**: The category of an incident, drawn from the active entries in the Incident_Type_Catalog.
- **Incident_Type_Catalog**: The system-managed registry of known incident types, each with a name, Default_Priority, optional description, active/inactive status, and an optional suggested Assigned_Body. Only active catalog entries are presented to IT_Representatives in the Mobile_App.
- **Default_Priority**: The priority level pre-assigned to an Incident_Type in the Incident_Type_Catalog. When an IT_Representative selects an Incident_Type, the Priority field is automatically pre-filled with the Default_Priority for that type. The IT_Representative may override this value before submitting.
- **Priority**: The urgency level of an incident. Valid values: Low, Medium, High.
- **Status**: The current lifecycle state of an incident. Valid values: Reported, Assigned, In-Progress, Resolved.
- **Assigned_Body**: The Organization or specific user currently responsible for resolving an incident.
- **SMS_Gateway**: The integrated SMS service used to send alert messages to officials' mobile phones.
- **Audit_Log**: An immutable, timestamped record of every action taken on an incident, including who performed it and from which device.
- **Escalation**: The act of raising an unresolved incident to a higher authority or a different Assigned_Body due to time threshold breach or scope mismatch.
- **MTTR**: Mean Time to Resolve — the average time elapsed between incident creation and resolution.
- **Exam_Disruption_Minutes**: The total minutes of exam activity disrupted by unresolved incidents, used as a KPI.
- **Sync_Status**: The indicator on the Mobile_App showing whether a locally stored incident has been successfully uploaded to the server (values: Pending, Synced).
- **Permission**: A named, action-level capability that controls whether a user or Organization may perform a specific action within the Portal (e.g., `incidents.view`, `incidents.assign`, `users.create`). Permissions are defined as a fixed, configurable set at the system level and are stored and enforced individually.
- **Permission_Group**: A logical label used in the UI to visually group related Permissions (e.g., "Incidents", "Users", "Organizations"). A Permission_Group is not itself a Permission and cannot be assigned; only the individual Permissions within a group can be assigned to an Organization or user.
- **Org_Permission_Set**: The collection of Permissions granted to an Organization by a Super_Admin. This set defines the maximum capability boundary for all users within that Organization; no user in the Organization may hold a Permission not included in the Org_Permission_Set.
- **User_Permission_Set**: The collection of Permissions assigned to an individual user by their Organization_Admin. The User_Permission_Set must be a subset of the Org_Permission_Set of the user's Organization.

---

## Requirements

### Requirement 1: Unified Web Portal with Role-Based Access Control

**User Story:** As a system administrator, I want all non-field users to access a single web portal where their role and organization determine what they see and can do, so that there is one consistent application to maintain and secure.

#### Acceptance Criteria

1. THE Web_Portal SHALL serve all non-field roles — Bureau_Staff, Organization_Admin, Super_Admin, MoE officials, AA_Education_Bureau officials, Ethio_Telecom users, ELPA users, and Security_Police users — from a single URL and codebase.
2. WHEN a user logs in to the Web_Portal, THE Web_Portal SHALL display only the views, menus, and data that correspond to that user's User_Permission_Set and Organization, as governed by the two-level permission model defined in Requirement 18.
3. THE Web_Portal SHALL enforce that users belonging to Ethio_Telecom, ELPA, or Security_Police who hold the `incidents.view` Permission can only view incidents that have been assigned to their Organization, and that users holding `incidents.update_status` or `incidents.comment` may only act on those same scoped incidents.
4. THE Web_Portal SHALL enforce that MoE and AA_Education_Bureau users have read-only access to incident data and dashboards, with no ability to create, update, or assign incidents, regardless of any Permissions in their User_Permission_Set.
5. THE Web_Portal SHALL enforce that ITDB Bureau_Staff holding `incidents.view` can view all incidents across all Organizations and all Exam_Fields.
6. IF a user attempts to access a view or perform an action outside their User_Permission_Set, THEN THE Web_Portal SHALL deny the request and display an "Access Denied" message without exposing data from other Organizations.
7. IF a user's User_Permission_Set contains a Permission that is not present in their Organization's Org_Permission_Set, THEN THE Web_Portal SHALL treat that Permission as not granted and deny any action that relies on it.

---

### Requirement 2: Dynamic Organization Registry and Multi-Tenant Support

**User Story:** As a Super_Admin, I want to register and manage any number of organizations at runtime, so that the system can accommodate new participating bodies without code changes and each organization remains autonomous while ITDB retains central oversight.

#### Acceptance Criteria

1. THE Portal SHALL maintain a dynamic registry of Organizations, each with a unique name, type, active/inactive status, and an Org_Permission_Set.
2. THE Super_Admin SHALL be able to create, update, and deactivate Organizations in the Web_Portal at runtime, without requiring changes to the application code or data model.
3. WHEN a Super_Admin creates or updates an Organization, THE Web_Portal SHALL allow the Super_Admin to assign any combination of the system-defined Permissions to that Organization's Org_Permission_Set.
4. WHEN a new Organization is created, THE Portal SHALL allow the Super_Admin to designate at least one user as the Organization_Admin for that Organization.
5. THE Organization_Admin SHALL be able to create, update, and deactivate user accounts within their own Organization only.
6. THE Organization_Admin SHALL NOT be able to view, create, or modify users belonging to other Organizations.
7. WHEN an Organization is deactivated, THE Portal SHALL immediately revoke all active sessions for users of that Organization and prevent new logins until the Organization is reactivated.
8. THE Portal SHALL treat the initial set of Organizations (ITDB, MoE, AA_Education_Bureau, Ethio_Telecom, ELPA, Security_Police) as runtime data entries, not hardcoded values, so that additional Organizations (e.g., city maintenance, emergency services) can be added by a Super_Admin without a deployment.

---

### Requirement 3: Device Registration and Exam Center Assignment

**User Story:** As a Super_Admin or Organization_Admin, I want to register IT Representatives with their device and assign them to specific exam centers, so that only authorized devices can report incidents for the exam centers they are assigned to.

#### Acceptance Criteria

1. WHEN an IT_Representative is registered in the system, THE Portal SHALL require a Device_ID to be associated with that IT_Representative's account.
2. THE Web_Portal SHALL allow a Super_Admin or Organization_Admin to assign an IT_Representative to one or more Exam_Fields, creating an Exam_Center_Assignment for each.
3. WHEN the Mobile_App launches, THE Mobile_App SHALL contact the central server to verify the Device_ID and retrieve only the Exam_Fields included in that device's Exam_Center_Assignment.
4. IF the Device_ID is not found on the pre-registered list, THEN THE Mobile_App SHALL block access and display a message stating that the device is not authorized.
5. WHEN an IT_Representative submits an incident, THE Mobile_App SHALL only allow selection of Exam_Fields that are part of that device's Exam_Center_Assignment, preventing reporting for unauthorized exam centers.
6. THE Web_Portal SHALL allow a Super_Admin or Organization_Admin to update an IT_Representative's Exam_Center_Assignment, after which THE Mobile_App SHALL reflect the updated assignment on the next successful sync.
7. THE Web_Portal SHALL allow a Super_Admin or Organization_Admin to deactivate a registered device, after which THE Mobile_App SHALL deny access to that device within 60 seconds of the next network-connected launch.
8. THE Web_Portal SHALL display a list of all registered devices showing Device_ID, associated IT_Representative, associated Exam_Fields, registration date, and active/inactive status.

---

### Requirement 4: QR Code Identity Credential for Field Staff

**User Story:** As a Security_Police officer at an exam field, I want to scan a field staff member's QR code to instantly verify their identity and authorization, so that only legitimate personnel are present at exam venues.

#### Acceptance Criteria

1. THE Portal SHALL generate a unique QR_Credential for each IT_Representative upon account activation, encoding the user's ID, name, role, Organization, and Exam_Center_Assignment.
2. THE Mobile_App SHALL display the IT_Representative's QR_Credential on demand, accessible from the user's profile screen without requiring a network connection.
3. THE Web_Portal SHALL allow authorized users to view and print the QR_Credential for any IT_Representative within their Organization.
4. WHEN a Security_Police user scans a QR_Credential using the Web_Portal's scan interface, THE Web_Portal SHALL display: the user's full name, role, Organization, the list of Exam_Fields they are authorized to be at, and whether their account is currently active or deactivated.
5. IF a scanned QR_Credential belongs to a deactivated account, THEN THE Web_Portal SHALL display a clear "Access Revoked" indicator to the scanning officer.
6. WHEN an IT_Representative's account is deactivated or their Exam_Center_Assignment is changed, THE Portal SHALL invalidate the previous QR_Credential and generate a new one, rendering the old QR code unverifiable.
7. THE QR_Credential SHALL be verifiable offline by the Web_Portal using a cryptographic signature, so that scanning works even during brief network interruptions.

---

### Requirement 5: Incident Reporting via Mobile App

**User Story:** As an IT_Representative, I want to report an exam incident from my mobile device, so that the Bureau is immediately notified and can begin resolving the problem.

#### Acceptance Criteria

1. WHEN an IT_Representative submits an incident, THE Mobile_App SHALL require selection of an Exam_Field from the device's Exam_Center_Assignment list, an Incident_Type from the active Incident_Type_Catalog entries, and a Priority before the form can be submitted.
2. WHEN an IT_Representative selects an Incident_Type, THE Mobile_App SHALL automatically pre-fill the Priority field with the Default_Priority defined for that Incident_Type in the Incident_Type_Catalog; the IT_Representative MAY override the pre-filled Priority before submitting.
3. THE Mobile_App SHALL allow an IT_Representative to attach a text description, one or more photos, and one or more video files as evidence to an incident report.
4. WHEN an IT_Representative submits an incident and a network connection is available, THE Mobile_App SHALL transmit the incident to the central server within 5 seconds and display a "Synced" Sync_Status.
5. WHEN an IT_Representative submits an incident and no network connection is available, THE Mobile_App SHALL store the incident in a local database and display a "Pending" Sync_Status.
6. WHEN network connectivity is restored, THE Mobile_App SHALL automatically retry uploading all Pending incidents using an exponential back-off mechanism, up to a maximum of 10 retry attempts per incident.
7. IF all retry attempts are exhausted without a successful upload, THEN THE Mobile_App SHALL notify the IT_Representative that the incident could not be synced and prompt manual retry.
8. THE Mobile_App SHALL display a list of all incidents submitted by the IT_Representative, showing the current Status and Sync_Status of each.

---

### Requirement 6: Incident Lifecycle and Status Management

**User Story:** As a Bureau_Staff member, I want to manage the full lifecycle of an incident from receipt to resolution, so that every problem is tracked, assigned, and closed in a structured way.

#### Acceptance Criteria

1. WHEN an incident is successfully received by the central server, THE Portal SHALL assign it the Status "Reported" and set the Assigned_Body to ITDB by default.
2. WHEN a Bureau_Staff member claims an incident, THE Web_Portal SHALL update the incident Status to "Assigned" and record the name of the Bureau_Staff member and the timestamp of the assignment.
3. WHEN a Bureau_Staff member begins active work on an incident, THE Web_Portal SHALL allow the Status to be updated to "In-Progress" and require a brief note describing the action being taken.
4. WHEN a Bureau_Staff member marks an incident as resolved, THE Web_Portal SHALL update the Status to "Resolved", record the resolution timestamp, and require a resolution summary of at least 10 characters.
5. THE Portal SHALL prevent Status from moving backward (e.g., from "Resolved" back to "In-Progress") without Super_Admin authorization.
6. THE Portal SHALL record every Status change in the Audit_Log, including the actor's user ID and role, the previous Status, the new Status, and the timestamp.

---

### Requirement 7: Incident Assignment, Reassignment, and Escalation

**User Story:** As a Bureau_Staff member, I want to assign or escalate incidents to an entire organization or a specific named user within an organization, and reassign them at any time, so that the right person or team handles each problem without delay.

#### Acceptance Criteria

1. WHEN a Bureau_Staff member assigns an incident, THE Web_Portal SHALL allow the Bureau_Staff member to choose either an entire Organization (all users of that Organization see it in their queue) or a specific named user within an Organization as the Assigned_Body.
2. WHEN an incident is assigned to an entire Organization, THE Web_Portal SHALL make that incident visible to all users of that Organization in their scoped incident view and send an in-system notification to those users.
3. WHEN an incident is assigned to a specific user, THE Web_Portal SHALL make that incident visible only to that user in their incident view and send an in-system notification to that user.
4. WHEN an incident is assigned to an Organization or a specific user, THE Portal SHALL optionally send an SMS alert via the SMS_Gateway to the designated contact number for that Organization or user, based on the notification preferences configured for that Organization.
5. WHEN a Bureau_Staff member reassigns an incident from one Organization or user to another, THE Web_Portal SHALL require the Bureau_Staff member to provide a reason for the reassignment before saving.
6. WHEN a reassignment is saved, THE Portal SHALL record the previous Assigned_Body, the new Assigned_Body, the reason, the actor's user ID, and the timestamp in the Audit_Log.
7. WHILE an incident has Status "In-Progress" and Priority "High", THE Portal SHALL automatically escalate the incident to the MoE exam-coordination unit and send an SMS alert if the incident remains unresolved for 30 minutes.
8. WHILE an incident has Status "In-Progress" and Priority "Medium", THE Portal SHALL automatically escalate the incident to the MoE exam-coordination unit and send an SMS alert if the incident remains unresolved for 90 minutes.
9. WHEN an automatic escalation is triggered, THE Portal SHALL record the escalation event in the Audit_Log, including the trigger condition, the new Assigned_Body, and the timestamp.
10. THE Web_Portal SHALL visually distinguish High-priority incidents from others by displaying them with a red highlight and placing them at the top of the incident list.

---

### Requirement 8: Incident Monitoring — Bureau Staff View

**User Story:** As a Bureau_Staff member, I want a real-time view of all incidents across all exam fields, so that I can prioritize work and ensure nothing is missed.

#### Acceptance Criteria

1. THE Web_Portal SHALL display to Bureau_Staff a table of all incidents with the following columns: Exam_Field, Incident_Type, Priority, time reported, Status, and Assigned_Body.
2. THE Web_Portal SHALL refresh the incident list automatically every 30 seconds without requiring a manual page reload.
3. THE Web_Portal SHALL provide filters allowing Bureau_Staff to view incidents by Status, Priority, Incident_Type, Exam_Field, and Assigned_Body, individually or in combination.
4. WHEN a Bureau_Staff member opens an incident detail view, THE Web_Portal SHALL display the full description, attached photos and videos, location (Exam_Field), and a chronological timeline of all actions taken on the incident.
5. THE Web_Portal SHALL allow Bureau_Staff to add comments and attach documents to an open incident at any time before the Status reaches "Resolved".
6. WHERE a GIS map view is enabled, THE Web_Portal SHALL display Exam_Fields as map markers on a map of Addis Ababa, color-coded as green (no active incidents), yellow (one or more In-Progress incidents), or red (one or more High-priority unresolved incidents).

---

### Requirement 9: Incident Monitoring — External Organization View

**User Story:** As a user from Ethio Telecom, ELPA, or Security Police, I want to see only the incidents assigned to my organization, so that I can act on my responsibilities without accessing unrelated data.

#### Acceptance Criteria

1. WHEN a user from Ethio_Telecom, ELPA, or Security_Police logs in to the Web_Portal, THE Web_Portal SHALL display only incidents where the Assigned_Body matches that user's Organization.
2. THE Web_Portal SHALL allow external Organization users to update the Status of incidents assigned to their Organization and add resolution notes.
3. THE Web_Portal SHALL prevent external Organization users from reassigning an incident to a different Organization or user; only Bureau_Staff may change the Assigned_Body.
4. THE Web_Portal SHALL refresh the external Organization's incident view automatically every 30 seconds without requiring a manual page reload.

---

### Requirement 10: Live Monitoring and Analytics — MoE and Leadership View

**User Story:** As an MoE or AA_Education_Bureau official, I want a live overview of all incidents and performance metrics, so that I can monitor exam operations and make evidence-based decisions.

#### Acceptance Criteria

1. THE Web_Portal SHALL display to MoE and AA_Education_Bureau users a live summary dashboard showing: total active incidents, count of incidents by Incident_Type, count of incidents by Exam_Field, and count of incidents by Status.
2. THE Web_Portal SHALL refresh live monitoring data for MoE and AA_Education_Bureau users automatically every 30 seconds without requiring a manual page reload.
3. THE Web_Portal SHALL display a real-time map of Addis Ababa showing all Exam_Fields as color-coded markers using the same color scheme as the Bureau_Staff map view.
4. THE Web_Portal SHALL allow MoE and AA_Education_Bureau users to filter the live monitoring view by time range (current exam cycle, last 7 days, custom date range), Incident_Type, and Assigned_Body.
5. THE Web_Portal SHALL calculate and display the following KPIs for MoE and AA_Education_Bureau users: MTTR per Incident_Type, average Exam_Disruption_Minutes per Exam_Field, and percentage of incidents resolved within the target time threshold for their Priority.

---

### Requirement 11: Reporting and Export

**User Story:** As an Admin or MoE official, I want to generate and export incident reports, so that I can share findings with stakeholders and support planning for future exam cycles.

#### Acceptance Criteria

1. THE Web_Portal SHALL generate a standard incident report containing: time-to-resolve per Incident_Type and Assigned_Body, average Exam_Disruption_Minutes per Exam_Field, and number of incidents resolved within the target time threshold.
2. THE Web_Portal SHALL allow authorized users to export any generated report in PDF format and in Excel (.xlsx) format.
3. THE Web_Portal SHALL allow authorized users to filter reports by exam cycle, date range, Exam_Field, Incident_Type, and Assigned_Body before generating the export.
4. WHEN an authorized user requests a report export, THE Web_Portal SHALL generate and make the file available for download within 30 seconds for datasets covering up to 12 months of incident data.
5. THE Web_Portal SHALL generate a post-exam-cycle summary report showing average resolution time, number of incidents per Exam_Field, and recurring problem areas identified by Incident_Type frequency per Exam_Field.

---

### Requirement 12: SMS Alert Integration

**User Story:** As a Bureau_Staff member or the system acting automatically, I want SMS alerts sent to key officials when critical incidents occur or escalate, so that decision-makers are informed even without internet access.

#### Acceptance Criteria

1. WHEN a High-priority incident is created and received by the server, THE Portal SHALL send an SMS alert via the SMS_Gateway to the pre-configured list of key officials within 60 seconds of receipt.
2. WHEN an incident is escalated to an external Organization, THE Portal SHALL send an SMS alert to the designated contact number of that Organization within 60 seconds of the escalation action.
3. WHEN an automatic time-threshold escalation is triggered, THE Portal SHALL send an SMS alert to the MoE exam-coordination unit contact number within 60 seconds.
4. THE Portal SHALL log every SMS alert sent, including the recipient phone number, message content, timestamp, and delivery status, in the Audit_Log.
5. IF the SMS_Gateway returns a delivery failure, THEN THE Portal SHALL retry the SMS delivery up to 3 times at 60-second intervals and record each attempt in the Audit_Log.
6. THE Web_Portal SHALL allow Bureau_Staff to manually trigger an SMS alert for any incident, selecting recipients from a pre-configured contact list.

---

### Requirement 13: User Management

**User Story:** As a Super_Admin or Organization_Admin, I want to manage users within my scope of authority, so that access control remains accurate as staff and assignments change.

#### Acceptance Criteria

1. THE Super_Admin SHALL be able to create, view, update, and deactivate user accounts for any role across all Organizations.
2. THE Organization_Admin SHALL be able to create, view, update, and deactivate user accounts only within their own Organization.
3. WHEN creating a user account with the IT_Representative role, THE Web_Portal SHALL require a Device_ID and at least one Exam_Center_Assignment before the account can be saved.
4. THE Web_Portal SHALL enforce that each Device_ID is associated with at most one active IT_Representative account at any time.
5. WHEN a user account is deactivated, THE Portal SHALL immediately revoke that user's session tokens, invalidate their QR_Credential, and prevent new logins for that account.
6. THE Web_Portal SHALL display a searchable list of all users within the actor's management scope, showing name, role, Organization, account status, and (for IT_Representatives) associated Device_ID and Exam_Center_Assignment.
7. WHEN an Organization_Admin assigns permissions to a user, THE Web_Portal SHALL display only the Permissions present in that Organization's Org_Permission_Set as selectable options, preventing the Organization_Admin from viewing or assigning Permissions the Organization does not hold.
8. THE Portal SHALL enforce at runtime that a user's User_Permission_Set is a subset of their Organization's Org_Permission_Set, rejecting any save operation that would result in a user holding a Permission not in the Org_Permission_Set.
9. WHEN a Super_Admin reduces an Organization's Org_Permission_Set, THE Portal SHALL automatically remove any Permissions from all users in that Organization that are no longer present in the updated Org_Permission_Set.

---

### Requirement 14: Notifications and Status Updates for IT Representatives

**User Story:** As an IT_Representative, I want to receive updates on the incidents I reported, so that I know when action is being taken and when the issue is resolved.

#### Acceptance Criteria

1. WHEN an incident reported by an IT_Representative has its Status changed to "Assigned", THE Mobile_App SHALL display an in-app notification to that IT_Representative on the next network-connected session.
2. WHEN an incident reported by an IT_Representative has its Status changed to "Resolved", THE Mobile_App SHALL display an in-app notification to that IT_Representative on the next network-connected session.
3. THE Mobile_App SHALL display the current Status of every incident the IT_Representative has submitted, updated on each successful sync with the server.
4. WHEN a High-priority incident is submitted by an IT_Representative and the network is available, THE Mobile_App SHALL allow the IT_Representative to request that an SMS alert be sent to designated contacts, triggering the SMS_Gateway within 60 seconds.

---

### Requirement 15: Audit Trail and Accountability

**User Story:** As a Super_Admin, I want a complete, tamper-evident audit trail of all system actions, so that every incident can be traced from report to resolution for accountability and performance evaluation.

#### Acceptance Criteria

1. THE Portal SHALL record an Audit_Log entry for every action that changes the state of an incident, including: incident creation, Status change, assignment change, comment addition, attachment upload, escalation, and resolution.
2. EACH Audit_Log entry SHALL contain: the actor's user ID and role, the actor's Organization, the Device_ID (for Mobile_App actions), the action type, the previous and new values of changed fields, and a UTC timestamp accurate to the second.
3. THE Web_Portal SHALL allow Super_Admins to view the full Audit_Log for any individual incident, sorted chronologically.
4. THE Web_Portal SHALL allow Super_Admins to search the Audit_Log by user ID, Device_ID, Organization, Exam_Field, date range, and action type.
5. THE Portal SHALL store Audit_Log entries in an append-only manner, preventing modification or deletion of existing entries by any user role including Super_Admin.

---

### Requirement 17: Configurable Incident Routing Rules

**User Story:** As a Super_Admin, I want to define routing rules that automatically suggest or assign the correct organization or user based on incident type, so that Bureau_Staff spend less time on manual triage and incidents reach the right handler faster.

#### Acceptance Criteria

1. THE Super_Admin SHALL be able to create, update, and delete Routing_Rules in the Web_Portal, each mapping an Incident_Type selected from the Incident_Type_Catalog to a target Assigned_Body (an Organization or a specific user).
2. WHEN a new incident is received and a Routing_Rule exists for its Incident_Type, THE Web_Portal SHALL pre-populate the assignment field with the suggested Assigned_Body when a Bureau_Staff member opens the incident for triage.
3. THE Bureau_Staff member SHALL be able to accept or override the suggested Assigned_Body before saving the assignment.
4. WHERE automatic assignment is enabled for a Routing_Rule, THE Portal SHALL automatically set the Assigned_Body without requiring Bureau_Staff confirmation, and SHALL record the automatic assignment in the Audit_Log with the matching Routing_Rule as the reason.
5. THE Portal SHALL store Routing_Rules as runtime configuration data, so that adding, modifying, or removing rules takes effect immediately without a deployment.
6. THE Web_Portal SHALL display to Super_Admins a list of all active Routing_Rules showing Incident_Type, target Assigned_Body, and whether automatic assignment is enabled.

---

### Requirement 19: Incident Type Catalog Management

**User Story:** As a Super_Admin, I want to manage a catalog of known incident types with default priorities, so that IT Representatives get consistent, pre-filled priority values when reporting incidents and routing rules can reference a stable set of types.

#### Acceptance Criteria

1. THE Portal SHALL maintain an Incident_Type_Catalog containing the following seed entries with their Default_Priority values: Students Access Management Issue (Medium), Access Management Issue (Medium), Power Failure (High), Network Outage (High), Security Incident (High), Exam-System Crash (High), Wellness Incident (Medium), Other (Low).
2. THE Super_Admin SHALL be able to create new Incident_Type_Catalog entries in the Web_Portal at runtime, each requiring a unique name, a Default_Priority (Low, Medium, or High), and an optional description.
3. THE Super_Admin SHALL be able to update the name, Default_Priority, description, and active/inactive status of any Incident_Type_Catalog entry.
4. WHERE an Organization_Admin holds the `catalog.create` and `catalog.edit` Permissions, THE Web_Portal SHALL allow that Organization_Admin to create and update Incident_Type_Catalog entries within the same constraints as a Super_Admin.
5. WHEN an Incident_Type_Catalog entry is set to inactive, THE Mobile_App SHALL no longer present that entry as a selectable Incident_Type in the incident reporting form.
6. THE Mobile_App SHALL fetch the current list of active Incident_Type_Catalog entries from the server on each successful sync, so that newly added or reactivated types appear without requiring an app update.
7. IF a Super_Admin attempts to delete an Incident_Type_Catalog entry that is referenced by one or more existing Routing_Rules or historical incidents, THEN THE Portal SHALL reject the deletion and display a message listing the conflicting references; the Super_Admin MAY set the entry to inactive instead.
8. THE Web_Portal SHALL display to Super_Admins a list of all Incident_Type_Catalog entries showing name, Default_Priority, description, active/inactive status, and the count of incidents reported under each type.
9. THE Portal SHALL store Incident_Type_Catalog entries as runtime configuration data, so that additions and updates take effect immediately without a deployment.

---

### Requirement 18: Two-Level Permission Model

**User Story:** As a Super_Admin, I want to assign a bounded set of permissions to each organization and allow Organization_Admins to assign subsets of those permissions to their users, so that access control is both flexible and strictly hierarchical.

#### Acceptance Criteria

1. THE Portal SHALL define the following ~35 system-level Permissions as the configurable permission set, organized into the Permission_Groups listed below. Each Permission is stored and enforced individually; Permission_Groups are UI labels only and are not assignable.

   **Incidents**
   - `incidents.view` — View incidents (scoped to org assignment for external orgs)
   - `incidents.create` — Create/report a new incident
   - `incidents.edit` — Edit incident details (description, type, priority)
   - `incidents.delete` — Delete an incident (Super_Admin only in practice)
   - `incidents.assign` — Assign or reassign an incident to an org or user
   - `incidents.update_status` — Change incident status (Assigned, In-Progress, Resolved)
   - `incidents.resolve` — Mark an incident as resolved
   - `incidents.escalate` — Manually escalate an incident
   - `incidents.comment` — Add comments to an incident
   - `incidents.attach` — Upload attachments to an incident

   **Users**
   - `users.view` — View user list and profiles (scoped to own org for Org_Admin)
   - `users.create` — Create new user accounts
   - `users.edit` — Edit user details (name, phone, role, exam assignments)
   - `users.delete` — Deactivate/delete a user account
   - `users.approve` — Approve a pending user registration
   - `users.assign_permissions` — Assign permissions to users within own org

   **Organizations**
   - `organizations.view` — View organization list and details
   - `organizations.create` — Register a new organization
   - `organizations.edit` — Edit organization details
   - `organizations.delete` — Deactivate an organization
   - `organizations.assign_permissions` — Assign permission set to an organization

   **Devices**
   - `devices.view` — View registered devices
   - `devices.register` — Register a new device
   - `devices.deactivate` — Deactivate a device

   **Exam Fields**
   - `exam_fields.view` — View exam field list
   - `exam_fields.create` — Add a new exam field
   - `exam_fields.edit` — Edit exam field details
   - `exam_fields.delete` — Remove an exam field

   **Incident Types (Catalog)**
   - `catalog.view` — View incident type catalog
   - `catalog.create` — Add new incident types
   - `catalog.edit` — Edit incident type details and default priority
   - `catalog.delete` — Delete/deactivate an incident type

   **Routing Rules**
   - `routing.view` — View routing rules
   - `routing.create` — Create new routing rules
   - `routing.edit` — Edit routing rules
   - `routing.delete` — Delete routing rules

   **Reports**
   - `reports.view` — View analytics dashboards and reports
   - `reports.export` — Export reports to PDF/Excel
   - `reports.generate` — Generate custom reports with filters

   **Audit Log**
   - `audit.view` — View audit log entries
   - `audit.search` — Search and filter audit log

   **QR & Identity**
   - `qr.view` — View QR credentials for users in own org
   - `qr.scan` — Scan and verify QR credentials at exam fields

   **Notifications & Alerts**
   - `alerts.sms_trigger` — Manually trigger SMS alerts
   - `alerts.push_trigger` — Manually trigger push notifications

2. THE Super_Admin SHALL be able to assign any combination of the system-level Permissions to an Organization's Org_Permission_Set when creating or editing that Organization. THE Web_Portal SHALL present these Permissions grouped by Permission_Group for readability.
3. THE Organization_Admin SHALL be able to assign any subset of their Organization's Org_Permission_Set to an individual user's User_Permission_Set.
4. IF an Organization_Admin attempts to assign a Permission to a user that is not present in the Organization's Org_Permission_Set, THEN THE Portal SHALL reject the operation and return a validation error.
5. THE Portal SHALL enforce at runtime, for every action a user attempts, that the required Permission is present in both the user's User_Permission_Set and the user's Organization's Org_Permission_Set before allowing the action to proceed.
6. IF a user's User_Permission_Set contains a Permission that is absent from the Organization's Org_Permission_Set at the time of the action, THEN THE Portal SHALL deny the action regardless of the user record's stored permissions.
7. WHEN a Super_Admin removes a Permission from an Organization's Org_Permission_Set, THE Portal SHALL automatically remove that Permission from the User_Permission_Set of every user in that Organization and record the change in the Audit_Log.
8. THE Web_Portal SHALL display to an Organization_Admin only the Permissions present in their Organization's Org_Permission_Set when the Organization_Admin is configuring a user's permissions, grouped by Permission_Group.
9. THE Web_Portal SHALL allow a Super_Admin to view the Org_Permission_Set of any Organization and the User_Permission_Set of any user.

---

### Requirement 16: System Availability and On-Premises Deployment

**User Story:** As the Bureau, I want the Portal deployed on-premises at the Bureau's data center and available throughout exam periods, so that all data remains under local control and the system is reliable when it matters most.

#### Acceptance Criteria

1. THE Portal SHALL be deployable on-premises on standard server hardware at the ITDB data center without dependency on external cloud services.
2. WHILE an exam cycle is active, THE Portal's central server SHALL maintain a system availability of at least 99% measured over each 24-hour exam day.
3. THE Portal SHALL support concurrent access by at least 100 IT_Representatives submitting incidents simultaneously without degradation of response time beyond 5 seconds per submission.
4. THE Portal SHALL support concurrent access by at least 50 Web_Portal users across all Organizations simultaneously without degradation of page load time beyond 3 seconds.
5. THE Portal SHALL retain all incident data and Audit_Log entries for a minimum of 5 years from the date of creation.
