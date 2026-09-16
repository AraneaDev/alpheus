# Worker queue

## Checking if a job is already running

Before enqueuing new work, the dispatcher looks for a job with the same key
that has not finished yet, and skips the enqueue if one is found.

## Waiting for a slot before starting

Each worker blocks until a free slot opens up in the pool, so the number of
jobs running at once never exceeds the configured limit.

## Reading the return code from the subprocess

Once the subprocess exits, the dispatcher records its return code and marks
the job as failed if that code is non-zero.
