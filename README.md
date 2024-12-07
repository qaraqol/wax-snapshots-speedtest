# WAX Snapshots Speedtest

A tool to discover and speed test WAX blockchain snapshots providers. This utility helps WAX node operators find the fastest snapshots provider for their region.

## Features

- Automatically discovers snapshots URLs from WAX block producer metadata
- Recursively searches provider websites for WAX snapshots
- Tests download speeds from each available provider
- Generates detailed speed test reports with rankings
- Supports various snapshots formats (bin, tar.gz, zst)
- Intelligent snapshots file detection with fallback patterns

## Prerequisites

- Bun 1.0.0 or higher (recommended)

## Installation

```bash
# Clone the repository
git clone https://github.com/qaraqol/wax-snapshots-speedtest.git
cd wax-snapshots-speedtest

# Install dependencies with Bun (recommended)
bun install

```

## Usage

```bash
# Run with Bun (recommended)
bun run app.js

```

The tool will:

1. Fetch a list of WAX block producers
2. Extract snapshots provider URLs from their metadata
3. Search each provider's website for WAX snapshots
4. Run speed tests on available snapshots
5. Generate a JSON report with the results

## Output

The speed test results are saved to a JSON file with the format `snapshots-speed-test-[timestamp].json`. The results include:

- Provider name
- Snapshots URL
- Download speed in Mbps
- Total data transferred
- Test timestamp
- Status and any errors

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
