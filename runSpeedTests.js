import https from "https";
import http from "http";
import { promises as fs } from "fs";

async function testSpeed(snapshot, testDuration = 10000) {
  // 10 seconds test duration
  return new Promise((resolve) => {
    const startTime = Date.now();
    let bytesReceived = 0;
    let result = {
      name: snapshot.name,
      url: snapshot.snapshotUrl,
      timestamp: new Date().toISOString(),
    };

    const client = snapshot.snapshotUrl.startsWith("https") ? https : http;

    const req = client.get(snapshot.snapshotUrl, (res) => {
      console.log(`\nTesting ${snapshot.name}...`);

      res.on("data", (chunk) => {
        bytesReceived += chunk.length;
        const elapsedTime = Date.now() - startTime;
        const speedMbps = (bytesReceived * 8) / 1000000 / (elapsedTime / 1000);

        // Update progress
        process.stdout.write(
          `\rReceived: ${(bytesReceived / 1048576).toFixed(
            2
          )} MB, Speed: ${speedMbps.toFixed(2)} Mbps`
        );

        if (elapsedTime >= testDuration) {
          req.destroy();
          result.speed = speedMbps;
          result.bytesReceived = bytesReceived;
          result.status = "success";
          resolve(result);
        }
      });

      res.on("error", (error) => {
        result.status = "error";
        result.error = error.message;
        resolve(result);
      });
    });

    req.on("error", (error) => {
      result.status = "error";
      result.error = error.message;
      resolve(result);
    });

    // Set timeout
    req.setTimeout(testDuration + 5000); // Add 5 seconds buffer
  });
}

async function runSpeedTests(snapshots) {
  const results = [];

  console.log("Starting speed tests...");
  console.log(`Will test ${snapshots.length} endpoints for 10 seconds each`);

  for (const snapshot of snapshots) {
    try {
      const result = await testSpeed(snapshot);
      results.push(result);

      // Log result
      console.log("\n----------------------------------------");
      console.log(`Results for ${result.name}:`);
      if (result.status === "success") {
        console.log(`Final Speed: ${result.speed.toFixed(2)} Mbps`);
        console.log(
          `Total Data: ${(result.bytesReceived / 1048576).toFixed(2)} MB`
        );
      } else {
        console.log(`Error: ${result.error}`);
      }
      console.log("----------------------------------------");
    } catch (error) {
      console.error(`Error testing ${snapshot.name}:`, error.message);
      results.push({
        name: snapshot.name,
        url: snapshot.snapshotUrl,
        status: "error",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Save results to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `snapshot-speed-test-${timestamp}.json`;

  await fs.writeFile(filename, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${filename}`);

  // Print summary
  console.log("\nTest Summary:");
  console.log("----------------------------------------");
  const successful = results.filter((r) => r.status === "success");
  if (successful.length > 0) {
    const avgSpeed =
      successful.reduce((acc, r) => acc + r.speed, 0) / successful.length;
    console.log(`Average Speed: ${avgSpeed.toFixed(2)} Mbps`);
    console.log(
      `Fastest: ${
        successful.reduce((a, b) => (a.speed > b.speed ? a : b)).name
      } (${successful
        .reduce((a, b) => (a.speed > b.speed ? a : b))
        .speed.toFixed(2)} Mbps)`
    );
    console.log(
      `Slowest: ${
        successful.reduce((a, b) => (a.speed < b.speed ? a : b)).name
      } (${successful
        .reduce((a, b) => (a.speed < b.speed ? a : b))
        .speed.toFixed(2)} Mbps)`
    );
  }
  console.log(`Successful tests: ${successful.length}/${results.length}`);
  const failed = results.filter((r) => r.status === "error");
  if (failed.length > 0) {
    console.log("\nFailed endpoints:");
    failed.forEach((f) => console.log(`- ${f.name}: ${f.error}`));
  }
}
export default runSpeedTests;
