package retry

import (
	"context"
	"time"
)

// Retry calls fn up to three times when the previous attempt failed with a
// transient error, waiting briefly between each retry so a temporary outage
// does not immediately return an error to the caller. Once the retry limit
// is reached, the original error from the last attempt is returned unchanged.
func Retry(ctx context.Context, fn func(context.Context) error) error {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		lastErr = fn(ctx)
		if lastErr == nil {
			return nil
		}
		time.Sleep(50 * time.Millisecond)
	}
	return lastErr
}
