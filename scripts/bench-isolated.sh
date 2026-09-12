#!/usr/bin/env bash
# Run a benchmark on CPUs nothing else is using.
#
# The numbers move with whatever else the machine is doing — a browser, a
# compile, a game. Interleaving the samples across engines (see bench/measure.js)
# takes most of that out of the ratio, and confining the run to its own cores
# takes out most of the rest. Measured over five runs of bench/run.js:
#
#   sequential, shared cores      1.17x - 1.47x   spread 0.30
#   interleaved, shared cores     1.22x - 1.39x   spread 0.17
#   interleaved, dedicated cores  1.31x - 1.40x   spread 0.09
#
# A transient scope rather than a container: it needs no daemon, no image and
# no root, and cgroups are what a container would be using for this anyway.
# Where systemd is not running the benchmark still works, just noisier.
set -euo pipefail

cpus="${BENCH_CPUS:-}"
if [[ -z "$cpus" ]]; then
	total="$(nproc)"
	if ((total < 4)); then
		echo "bench: only $total CPUs; running without isolation" >&2
		exec node "$@"
	fi
	# The top two, on the assumption that whatever else is running was scheduled
	# onto lower-numbered cores first.
	cpus="$((total - 2))-$((total - 1))"
fi

if ! command -v systemd-run >/dev/null 2>&1; then
	echo "bench: no systemd-run; running without isolation" >&2
	exec node "$@"
fi

echo "bench: CPUs $cpus" >&2
exec systemd-run --user --scope -q \
	-p AllowedCPUs="$cpus" \
	-p MemoryMax=4G \
	-- node "$@"
