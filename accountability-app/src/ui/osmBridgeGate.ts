import {
  createOsmRouteMessage,
  createOsmViewportMessage,
  type LatLng,
  type OsmAuthenticatedBridgeMessage,
  type OsmBridgeMessage,
  type OsmBridgeReadyMessage,
  type OsmDocumentIdentity,
  type OsmRouteBridgeMessage,
  type OsmRouteUpdateOptions,
  type OsmViewportBridgeMessage,
} from './osmHtml';

function sameIdentity(a: OsmDocumentIdentity | null, b: OsmDocumentIdentity) {
  return a?.generation === b.generation && a?.nonce === b.nonce;
}

export class OsmBridgeGate {
  private identity: OsmDocumentIdentity | null = null;
  private ready = false;
  private desiredRoute: OsmRouteBridgeMessage | null = null;
  private desiredViewport: OsmViewportBridgeMessage | null = null;
  private declarativeClearPending = false;

  constructor(
    private readonly transport: (message: OsmAuthenticatedBridgeMessage) => void,
  ) {}

  setDocument(identity: OsmDocumentIdentity) {
    if (sameIdentity(this.identity, identity)) return;
    this.identity = identity;
    this.ready = false;
  }

  invalidate() {
    this.ready = false;
  }

  prepareDeclarativeClear() {
    this.desiredRoute = { type: 'clear-route' };
    this.desiredViewport = null;
    this.declarativeClearPending = true;
  }

  cancelPreparedDeclarativeClear() {
    if (!this.declarativeClearPending) return;
    this.declarativeClearPending = false;
    if (this.desiredRoute?.type === 'clear-route') {
      this.desiredRoute = null;
    }
  }

  setRoute(route: LatLng[], options?: OsmRouteUpdateOptions | LatLng) {
    this.declarativeClearPending = false;
    const message = createOsmRouteMessage(route, options);
    if (message.type === 'clear-route') {
      this.desiredRoute = message;
      this.desiredViewport = null;
      this.sendWhenReady(message);
      return;
    }

    this.desiredRoute = {
      type: 'route',
      route: message.route,
      viewport: { mode: 'preserve' },
    };
    const explicitViewport = message.viewport.mode === 'preserve'
      ? null
      : createOsmViewportMessage(message.viewport);
    if (explicitViewport) {
      this.desiredViewport = explicitViewport;
    } else if (this.desiredViewport?.viewport.mode === 'center') {
      const latest = route.at(-1);
      if (latest) {
        this.desiredViewport = createOsmViewportMessage({
          mode: 'center',
          center: latest,
        });
      }
    }

    this.sendWhenReady(this.desiredRoute);
    if (explicitViewport) this.sendWhenReady(explicitViewport);
  }

  clearRoute() {
    this.setRoute([]);
  }

  centerOn(point: LatLng) {
    this.desiredViewport = createOsmViewportMessage({ mode: 'center', center: point });
    this.sendWhenReady(this.desiredViewport);
  }

  fitRoute() {
    this.desiredViewport = createOsmViewportMessage({ mode: 'overview' });
    this.sendWhenReady(this.desiredViewport);
  }

  requestReady() {
    this.sendAuthenticated({ type: 'osm-ready-request' });
  }

  acceptReady(message: unknown) {
    if (!this.identity || !message || typeof message !== 'object') return false;
    const ready = message as Partial<OsmBridgeReadyMessage>;
    if (
      ready.type !== 'osm-ready' ||
      ready.generation !== this.identity.generation ||
      ready.nonce !== this.identity.nonce ||
      this.ready
    ) {
      return false;
    }
    this.ready = true;
    const route = this.desiredRoute;
    if (this.declarativeClearPending) {
      this.declarativeClearPending = false;
      this.desiredRoute = null;
    }
    if (route) this.sendAuthenticated(route);
    if (this.desiredViewport) this.sendAuthenticated(this.desiredViewport);
    return true;
  }

  private sendWhenReady(message: OsmBridgeMessage) {
    if (this.ready) this.sendAuthenticated(message);
  }

  private sendAuthenticated(message: OsmBridgeMessage | { type: 'osm-ready-request' }) {
    if (!this.identity) return;
    this.transport({ ...message, ...this.identity } as OsmAuthenticatedBridgeMessage);
  }
}
