#!/bin/bash
# Statusline script: writes rate_limits and per-session context data
# for Claude Monitor dashboard.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../.data"
OUTFILE="$DATA_DIR/rate-limits-latest.json"

mkdir -p "$DATA_DIR/contexts" 2>/dev/null

input=$(cat)

# Write rate_limits JSON
echo "$input" | jq -c '{
  timestamp: (now | todate),
  model: .model.display_name,
  five_hour: {
    used_percentage: (.rate_limits.five_hour.used_percentage // null),
    resets_at: (.rate_limits.five_hour.resets_at // null)
  },
  seven_day: {
    used_percentage: (.rate_limits.seven_day.used_percentage // null),
    resets_at: (.rate_limits.seven_day.resets_at // null)
  },
  sonnet_only: {
    used_percentage: (.rate_limits.sonnet_only.used_percentage // null),
    resets_at: (.rate_limits.sonnet_only.resets_at // null)
  }
}' > "$OUTFILE" 2>/dev/null

# Write per-session context data
SESSION_ID=$(echo "$input" | jq -r '.session_id // empty')
if [ -n "$SESSION_ID" ]; then
  echo "$input" | jq -c '{
    session_id: .session_id,
    timestamp: (now | todate),
    model: .model.display_name,
    context_window: {
      used_percentage: (.context_window.used_percentage // null),
      remaining_percentage: (.context_window.remaining_percentage // null),
      context_window_size: (.context_window.context_window_size // null),
      total_input_tokens: (.context_window.total_input_tokens // null),
      total_output_tokens: (.context_window.total_output_tokens // null)
    },
    cost: {
      total_cost_usd: (.cost.total_cost_usd // null),
      total_duration_ms: (.cost.total_duration_ms // null)
    }
  }' > "$DATA_DIR/contexts/$SESSION_ID.json" 2>/dev/null
fi

# Display in status line
MODEL=$(echo "$input" | jq -r '.model.display_name // "unknown"')
FIVE_H=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
WEEK=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
CTX=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

LIMITS=""
[ -n "$FIVE_H" ] && LIMITS="5h: $(printf '%.0f' "$FIVE_H")%"
[ -n "$WEEK" ] && LIMITS="${LIMITS:+$LIMITS }7d: $(printf '%.0f' "$WEEK")%"
[ -n "$CTX" ] && LIMITS="${LIMITS:+$LIMITS }ctx: $(printf '%.0f' "$CTX")%"

[ -n "$LIMITS" ] && echo "[$MODEL] | $LIMITS" || echo "[$MODEL]"
