import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server as HttpServer } from 'http';
import { parse as parseUrl } from 'url';
import { jwtService, JwtPayload } from '../auth/jwt.service';
import { getRedis } from '../db/redis';
import type Redis from 'ioredis';

/**
 * WebSocket server for real-time push notifications.
 *
 * Responsibilities:
 * 1. Upgrade HTTP connections to WebSocket
 * 2. Authenticate via JWT (query param or Authorization header)
 * 3. Subscribe each connection to a Redis pub/sub channel scoped to the user's region
 * 4. Broadcast events: incident.created, incident.status_changed, incident.assigned,
 *    incident.escalated, notification.new
 *
 * Requirements: 8.2, 9.4, 10.2
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthenticatedWebSocket extends WebSocket {
  userId: string;
  regionId: string | null;
  role: string;
  isAlive: boolean;
}

interface WebSocketEvent {
  event: string;
  data: unknown;
}

// ─── WebSocket Server ────────────────────────────────────────────────────────

export class WebSocketServerManager {
  private wss: WebSocketServer | null = null;
  private redisSubscriber: Redis | null = null;
  private regionChannelMap: Map<string, Set<AuthenticatedWebSocket>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * Initializes the WebSocket server and attaches it to the HTTP server.
   */
  initialize(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({ noServer: true });

    // Handle HTTP upgrade requests
    httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
      this.handleUpgrade(request, socket, head);
    });

    // Handle new WebSocket connections
    this.wss.on('connection', (ws: WebSocket, _request: IncomingMessage, payload: JwtPayload) => {
      this.handleConnection(ws as AuthenticatedWebSocket, payload);
    });

    // Initialize Redis subscriber for pub/sub
    this.initializeRedisSubscriber();

    // Start heartbeat to detect dead connections
    this.startHeartbeat();

    console.info('[WebSocket] Server initialized');
  }

  /**
   * Handles HTTP upgrade requests and authenticates the connection.
   */
  private handleUpgrade(request: IncomingMessage, socket: any, head: Buffer): void {
    try {
      // Extract JWT from query param or Authorization header
      const token = this.extractToken(request);
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Verify JWT
      const payload = jwtService.verifyToken(token);

      // Check if token is revoked
      jwtService.isRevoked(payload).then((revoked) => {
        if (revoked) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // Complete the WebSocket upgrade
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request, payload);
        });
      }).catch((err) => {
        console.error('[WebSocket] Token revocation check failed:', err);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      });
    } catch (err) {
      console.error('[WebSocket] Authentication failed:', err);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  }

  /**
   * Extracts JWT token from query param or Authorization header.
   */
  private extractToken(request: IncomingMessage): string | null {
    // Try query param first (e.g., ws://host/ws?token=xxx)
    const url = parseUrl(request.url ?? '', true);
    if (url.query.token && typeof url.query.token === 'string') {
      return url.query.token;
    }

    // Try Authorization header (e.g., Authorization: Bearer xxx)
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * Handles a new WebSocket connection.
   */
  private handleConnection(ws: AuthenticatedWebSocket, payload: JwtPayload): void {
    // Attach user info to the WebSocket
    ws.userId = payload.sub;
    ws.regionId = payload.regionId ?? null;
    ws.role = payload.role;
    ws.isAlive = true;

    // Subscribe to the user's region channel
    this.subscribeToRegionChannel(ws);

    // Admin roles also subscribe to the global channel so they see all regions
    if (
      (payload.role === 'super_admin' || payload.role === 'national_command') &&
      ws.regionId !== null // already subscribed to global if regionId is null
    ) {
      this.addToChannel(ws, 'region:global');
    }

    // Handle pong responses for heartbeat
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle connection close
    ws.on('close', () => {
      this.unsubscribeFromRegionChannel(ws);
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error('[WebSocket] Connection error:', err);
      this.unsubscribeFromRegionChannel(ws);
    });

    console.info(`[WebSocket] Client connected: userId=${ws.userId}, regionId=${ws.regionId}`);
  }

  /**
   * Subscribes a WebSocket connection to its region's Redis pub/sub channel.
   */
  private subscribeToRegionChannel(ws: AuthenticatedWebSocket): void {
    const channel = `region:${ws.regionId ?? 'global'}`;
    this.addToChannel(ws, channel);
  }

  /**
   * Adds a WebSocket client to a named channel.
   */
  private addToChannel(ws: AuthenticatedWebSocket, channel: string): void {
    if (!this.regionChannelMap.has(channel)) {
      this.regionChannelMap.set(channel, new Set());
    }
    this.regionChannelMap.get(channel)!.add(ws);
    console.info(`[WebSocket] Subscribed userId=${ws.userId} to channel=${channel}`);
  }

  /**
   * Removes a WebSocket client from a named channel.
   */
  private removeFromChannel(ws: AuthenticatedWebSocket, channel: string): void {
    const clients = this.regionChannelMap.get(channel);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.regionChannelMap.delete(channel);
      }
    }
  }

  /**
   * Unsubscribes a WebSocket connection from all its channels.
   */
  private unsubscribeFromRegionChannel(ws: AuthenticatedWebSocket): void {
    const channel = `region:${ws.regionId ?? 'global'}`;
    this.removeFromChannel(ws, channel);

    // Also remove from global if this was an admin
    if (
      (ws.role === 'super_admin' || ws.role === 'national_command') &&
      ws.regionId !== null
    ) {
      this.removeFromChannel(ws, 'region:global');
    }

    console.info(`[WebSocket] Unsubscribed userId=${ws.userId} from channel=${channel}`);
  }

  /**
   * Initializes the Redis subscriber for pub/sub.
   */
  private initializeRedisSubscriber(): void {
    // Create a separate Redis client for pub/sub (ioredis requirement)
    this.redisSubscriber = getRedis().duplicate();

    // Subscribe to all region channels using pattern matching
    this.redisSubscriber.psubscribe('region:*', (err, count) => {
      if (err) {
        console.error('[WebSocket] Redis psubscribe failed:', err);
        return;
      }
      console.info(`[WebSocket] Subscribed to ${count} Redis channel patterns`);
    });

    // Handle incoming messages
    this.redisSubscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      this.handleRedisMessage(channel, message);
    });

    // Handle Redis errors
    this.redisSubscriber.on('error', (err: Error) => {
      console.error('[WebSocket] Redis subscriber error:', err);
    });
  }

  /**
   * Handles incoming Redis pub/sub messages and broadcasts to connected clients.
   */
  private handleRedisMessage(channel: string, message: string): void {
    try {
      const event: WebSocketEvent = JSON.parse(message);

      // Get all WebSocket clients subscribed to this channel
      const clients = this.regionChannelMap.get(channel);
      if (!clients || clients.size === 0) {
        return;
      }

      // Broadcast to all connected clients in this region
      const payload = JSON.stringify(event);
      clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      });

      console.info(`[WebSocket] Broadcasted event=${event.event} to ${clients.size} clients on channel=${channel}`);
    } catch (err) {
      console.error('[WebSocket] Failed to handle Redis message:', err);
    }
  }

  /**
   * Starts a heartbeat interval to detect dead connections.
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;

      this.wss.clients.forEach((ws) => {
        const client = ws as AuthenticatedWebSocket;
        if (!client.isAlive) {
          console.info(`[WebSocket] Terminating dead connection: userId=${client.userId}`);
          return client.terminate();
        }

        client.isAlive = false;
        client.ping();
      });
    }, 30_000); // 30 seconds
  }

  /**
   * Gracefully shuts down the WebSocket server.
   */
  async shutdown(): Promise<void> {
    console.info('[WebSocket] Shutting down...');

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Close all WebSocket connections
    if (this.wss) {
      this.wss.clients.forEach((ws) => {
        ws.close(1001, 'Server shutting down');
      });
      this.wss.close();
      this.wss = null;
    }

    // Close Redis subscriber
    if (this.redisSubscriber) {
      await this.redisSubscriber.quit();
      this.redisSubscriber = null;
    }

    // Clear channel map
    this.regionChannelMap.clear();

    console.info('[WebSocket] Shutdown complete');
  }
}

// Export singleton instance
export const websocketServer = new WebSocketServerManager();
