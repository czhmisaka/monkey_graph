import { graphOperations } from '../../database.js';

export async function getGraphSettings(graphId) {
  const settings = graphOperations.getSettings(graphId);
  return { success: true, data: settings };
}

export async function updateGraphSettings(args, graphId, sendEvent) {
  if (!graphId) {
    return { success: false, error: '没有指定图谱ID' };
  }
  const currentSettings = graphOperations.getSettings(graphId) || {};
  const newSettings = { ...currentSettings };

  if (args.nodeTypes) {
    newSettings.nodeTypes = { ...(newSettings.nodeTypes || {}), ...args.nodeTypes };
  }
  if (args.edgeTypes) {
    newSettings.edgeTypes = { ...(newSettings.edgeTypes || {}), ...args.edgeTypes };
  }

  const updatedSettings = graphOperations.updateSettings(graphId, newSettings);

  if (sendEvent) {
    sendEvent({ type: 'settings', settings: updatedSettings });
  }

  return { success: true, data: updatedSettings };
}

export async function deleteGraphSettings(args, graphId) {
  if (!graphId) {
    return { success: false, error: '没有指定图谱ID' };
  }
  const currentSettings = graphOperations.getSettings(graphId) || {};
  const newSettings = { ...currentSettings };
  const deletedItems = { nodeTypes: [], edgeTypes: [] };

  if (args.clearAll) {
    newSettings.nodeTypes = {};
    newSettings.edgeTypes = {};
    deletedItems.nodeTypes = Object.keys(currentSettings.nodeTypes || {});
    deletedItems.edgeTypes = Object.keys(currentSettings.edgeTypes || {});
  } else {
    if (args.nodeTypes && Array.isArray(args.nodeTypes)) {
      newSettings.nodeTypes = { ...(newSettings.nodeTypes || {}) };
      for (const type of args.nodeTypes) {
        if (newSettings.nodeTypes[type]) {
          delete newSettings.nodeTypes[type];
          deletedItems.nodeTypes.push(type);
        }
      }
    }

    if (args.edgeTypes && Array.isArray(args.edgeTypes)) {
      newSettings.edgeTypes = { ...(newSettings.edgeTypes || {}) };
      for (const type of args.edgeTypes) {
        if (newSettings.edgeTypes[type]) {
          delete newSettings.edgeTypes[type];
          deletedItems.edgeTypes.push(type);
        }
      }
    }
  }

  const updatedSettings = graphOperations.updateSettings(graphId, newSettings);
  return {
    success: true,
    data: {
      deleted: deletedItems,
      currentSettings: updatedSettings
    }
  };
}
