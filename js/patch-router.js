export class PatchRouter {
  constructor() {
    this.jacks = new Map(); // jackId -> { node, type: 'output'|'input', param?, label }
    this.connections = new Map(); // `${srcId}->${destId}` -> { source, dest }
  }

  registerJack(jackId, node, type, options = {}) {
    this.jacks.set(jackId, {
      node,
      type,
      param: options.param || null,
      label: options.label || jackId
    });
  }

  getJack(jackId) {
    return this.jacks.get(jackId);
  }

  connect(sourceId, destId) {
    const source = this.jacks.get(sourceId);
    const dest = this.jacks.get(destId);

    if (!source || !dest) {
      console.warn(`PatchRouter: jack not found — source=${sourceId}, dest=${destId}`);
      return false;
    }

    if (source.type !== 'output' || dest.type !== 'input') {
      console.warn(`PatchRouter: invalid connection types — ${source.type} -> ${dest.type}`);
      return false;
    }

    const key = `${sourceId}->${destId}`;
    if (this.connections.has(key)) {
      return true; // already connected
    }

    try {
      if (dest.param) {
        source.node.connect(dest.param);
      } else {
        source.node.connect(dest.node);
      }
      this.connections.set(key, { sourceId, destId });
      return true;
    } catch (e) {
      console.error(`PatchRouter: connect failed — ${key}`, e);
      return false;
    }
  }

  disconnect(sourceId, destId) {
    const source = this.jacks.get(sourceId);
    const dest = this.jacks.get(destId);
    const key = `${sourceId}->${destId}`;

    if (!this.connections.has(key)) {
      return;
    }

    try {
      if (dest?.param) {
        source?.node?.disconnect(dest.param);
      } else if (dest?.node) {
        source?.node?.disconnect(dest.node);
      }
    } catch (e) {
      // May fail if already disconnected
    }

    this.connections.delete(key);
  }

  disconnectAll() {
    for (const [key, conn] of this.connections) {
      this.disconnect(conn.sourceId, conn.destId);
    }
  }

  getConnections() {
    return Array.from(this.connections.values());
  }
}
