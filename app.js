import getSnapshotFiles from "./getSnapshotFiles.js";
import runSpeedTests from "./runSpeedTests.js";

(async () => {
  const snapshotFiles = await getSnapshotFiles();
  const snapshots = snapshotFiles.filter((s) => s.snapshotUrl !== null);
  runSpeedTests(snapshots).catch(console.error);
})();
