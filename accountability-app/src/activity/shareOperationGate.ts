export type ShareOperationGate = {
  run(operation: () => unknown | Promise<unknown>): Promise<boolean>;
};

export function createShareOperationGate(): ShareOperationGate {
  let inProgress = false;

  return {
    async run(operation) {
      if (inProgress) return false;

      inProgress = true;
      try {
        await operation();
        return true;
      } finally {
        inProgress = false;
      }
    },
  };
}
