# Claude Monitor TUI

A real-time terminal dashboard for monitoring [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions, API rate limits, token usage, and activity trends.

![Claude Monitor TUI Preview](preview.png)

**[한국어](#한국어)**

---

## Requirements

- [Bun](https://bun.sh/) runtime (v1.0+)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and configured (`~/.claude/` directory)
- `jq` command-line tool (for rate limit tracking)
- Terminal with Unicode support

---

## Setup & Run

### 1. Install dependencies

```bash
bun install
```

### 2. Run

```bash
# Development mode (hot reload on file changes)
bun run dev

# Production mode
bun run start
```

### 3. Rate limit tracking setup

On first launch, Claude Monitor automatically configures your `~/.claude/settings.json` to use its statusline script. **You must restart any running Claude Code sessions** for this to take effect.

If you want to set it up manually:

```json
// ~/.claude/settings.json
{
  "statusLine": {
    "type": "command",
    "command": "/absolute/path/to/claude-monitor-tui/scripts/statusline-rate-limits.sh"
  }
}
```

---

## Build Binary

Compile to a standalone executable using Bun:

```bash
bun build --compile src/index.ts --outfile claude-monitor
```

This creates a single `claude-monitor` binary with all dependencies bundled. Run it directly:

```bash
./claude-monitor
```

### Cross-platform build

```bash
# macOS ARM (Apple Silicon)
bun build --compile --target=bun-darwin-arm64 src/index.ts --outfile claude-monitor

# macOS Intel
bun build --compile --target=bun-darwin-x64 src/index.ts --outfile claude-monitor

# Linux x64
bun build --compile --target=bun-linux-x64 src/index.ts --outfile claude-monitor
```

---

## Dashboard Sections

### Logo

Displays the Claude Monitor ASCII art logo with the current Claude Code version number. The logo centers dynamically based on terminal width.

### Usage (Rate Limits)

Shows your current Claude API rate limit consumption across multiple time windows.

- **Model** — The Claude model currently in use (e.g., "Claude Opus 4.6")
- **5h** — 5-hour sliding window usage percentage with a gauge bar, reset time, and countdown
- **7d** — 7-day sliding window usage percentage with a gauge bar, reset time, and countdown
- **Sonnet** — Sonnet-specific rate limit window (shown only when applicable)
- **Tokens** — Cumulative token counts: total (input + output) and cache (read + create), formatted with K/M/B suffixes

> Updated every 3 seconds

### Sessions

Lists all Claude Code sessions detected on your machine with live process statistics.

- **PID** — Operating system process ID
- **Session ID** — Unique Claude Code session identifier
- **Path** — Working directory of the session (shortened to fit terminal width)
- **Uptime** — How long the session has been running (e.g., "2h 15m")
- **CPU** — Current CPU usage percentage of the process
- **Memory** — Resident memory (RSS) in MB
- **Context** — Context window usage percentage, provided by the Claude Code API via the statusline hook. The TUI does not compute this value itself — it displays the `context_window.used_percentage` reported by each session.

Dead (terminated) sessions are shown at the bottom with a `[DEAD]` marker. The panel height adjusts dynamically based on the number of sessions.

> Updated every 3 seconds

### Agents

Displays all available Claude Code agents — both built-in (e.g., Explore, Plan, claude-code-guide) and user-defined agents from `~/.claude/agents/`.

- **Name** — Agent name
- **Type** — `built-in` or `user`
- **Color** — Agent's configured color with a colored preview block
- **Source** — Where the agent is defined (`system` or `~/.claude/agents/`)

This panel updates automatically when files in the agents directory change.

### Messages

Shows activity trends and historical statistics for your Claude Code usage.

- **Header stats** — `Total Sess`, `Total Msgs`, `Today Sess` (with ▲/▼/━ trend vs. yesterday), `Today Msgs`
- **14-day line chart** — ASCII line chart visualizing daily message counts. Y-axis auto-scales, X-axis shows date labels (M/DD).
- **Footer** — Longest session duration ever recorded, and the date of your first Claude Code session.

> Updated every 30 seconds

### Hourly Activity

A vertical bar chart showing message distribution across 24 hours (00–23). Uses Unicode block characters (▁▂▃▄▅▆▇█) to represent relative activity levels.

> Updated every 30 seconds

### Projects

Displays per-project token usage breakdown with proportional bar charts. Each row shows session count, message count, tool call count, token percentage, and input/output token totals.

> Updated every 30 seconds

### Tasks

Displays Claude Code tasks from `~/.claude/tasks/`. Tasks are created by Claude Code during conversations to track multi-step work.

- **Status icon** — `▶` in progress, `○` pending, `✓` completed
- **ID** — Task number within the session
- **Session** — Mapped to the Session ID shown in the Sessions panel. For active sessions, the live session ID is displayed. For `--resume` sessions where the conversation ID differs, the mapping falls back through the context data (via PID). For terminated sessions, the original conversation ID is shown.
- **Subject** — Task description

The panel label shows a summary count: `Tasks (N) [▶X ○Y ✓Z]`

> Updated every 30 seconds

### Recent Prompts

Displays the 10 most recent user prompts across all sessions, newest first.

- **Date** — Timestamp in M/DD HH:MM format
- **Session** — Mapped to the Session ID shown in the Sessions panel (same mapping logic as Tasks)
- **Prompt** — The prompt text (first line, truncated to fit terminal width)

CJK (Korean, Chinese, Japanese) characters are handled correctly for visual width calculations.

> Updated every 30 seconds

### Status Bar

The bottom bar showing the current monitoring state and controls.

- **Keyboard shortcuts** — `[q]` Quit, `[r]` Manual refresh, `[c]` Clean dead session files
- **Polling** — Current polling interval (3s)
- **Refresh indicator** — Animated spinner and progress bar during data refresh, "Idle" when not refreshing
- **Last Update** — Timestamp of the most recent data refresh (HH:MM:SS)

---

## Data Sources

| Data | Source Path | Description |
|------|-------------|-------------|
| Sessions | `~/.claude/sessions/` | Active Claude Code session files |
| Agents | `~/.claude/agents/` | User-defined agent definitions |
| Tasks | `~/.claude/tasks/` | Per-session task tracking files |
| History | `~/.claude/history.jsonl` | Recent user prompt history |
| Usage | `~/.claude/projects/**/*.jsonl` | Session message and token data |
| Rate Limits | `.data/rate-limits-latest.json` | Current API rate limit status (written by statusline script) |
| Context | `.data/contexts/*.json` | Per-session context window usage (written by statusline script) |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `q` / `Ctrl+C` | Quit the dashboard |
| `r` | Manual refresh all data |
| `c` | Clean dead session files |

---

## License

MIT

---

---

# 한국어

Claude Code의 세션, API 사용량, 토큰 소비량, 활동 트렌드를 실시간으로 모니터링하는 터미널 대시보드입니다.

![Claude Monitor TUI Preview](preview.png)

**[English](#claude-monitor-tui)**

---

## 요구 사항

- [Bun](https://bun.sh/) 런타임 (v1.0+)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 설치 및 설정 완료 (`~/.claude/` 디렉토리)
- `jq` 커맨드라인 도구 (Rate Limit 추적용)
- 유니코드를 지원하는 터미널

---

## 환경 세팅 및 실행

### 1. 의존성 설치

```bash
bun install
```

### 2. 실행

```bash
# 개발 모드 (파일 변경 시 자동 재시작)
bun run dev

# 프로덕션 모드
bun run start
```

### 3. Rate Limit 추적 설정

처음 실행 시 `~/.claude/settings.json`에 statusline 스크립트가 자동으로 설정됩니다. **실행 중인 Claude Code 세션을 재시작해야** 적용됩니다.

수동으로 설정하려면:

```json
// ~/.claude/settings.json
{
  "statusLine": {
    "type": "command",
    "command": "/absolute/path/to/claude-monitor-tui/scripts/statusline-rate-limits.sh"
  }
}
```

---

## 바이너리 빌드

Bun을 사용해 독립 실행 파일로 컴파일합니다:

```bash
bun build --compile src/index.ts --outfile claude-monitor
```

모든 의존성이 포함된 단일 `claude-monitor` 바이너리가 생성됩니다:

```bash
./claude-monitor
```

### 크로스 플랫폼 빌드

```bash
# macOS ARM (Apple Silicon)
bun build --compile --target=bun-darwin-arm64 src/index.ts --outfile claude-monitor

# macOS Intel
bun build --compile --target=bun-darwin-x64 src/index.ts --outfile claude-monitor

# Linux x64
bun build --compile --target=bun-linux-x64 src/index.ts --outfile claude-monitor
```

---

## 대시보드 섹션

### Logo

Claude Monitor ASCII 아트 로고와 현재 Claude Code 버전 번호를 표시합니다. 로고는 터미널 너비에 맞춰 자동으로 가운데 정렬됩니다.

### Usage (Rate Limit)

여러 시간 구간에 걸친 Claude API Rate Limit 소비량을 표시합니다.

- **Model** — 현재 사용 중인 Claude 모델 (예: "Claude Opus 4.6")
- **5h** — 5시간 슬라이딩 윈도우 사용률 (게이지 바 + 리셋 시간 + 카운트다운)
- **7d** — 7일 슬라이딩 윈도우 사용률 (게이지 바 + 리셋 시간 + 카운트다운)
- **Sonnet** — Sonnet 전용 Rate Limit 윈도우 (해당 시에만 표시)
- **Tokens** — 누적 토큰 수: 전체 (입력 + 출력) 및 캐시 (읽기 + 생성), K/M/B 접미사로 표시

> 3초마다 갱신

### Sessions (세션)

머신에서 감지된 모든 Claude Code 세션을 실시간 프로세스 통계와 함께 나열합니다.

- **PID** — 운영체제 프로세스 ID
- **Session ID** — Claude Code 고유 세션 식별자
- **Path** — 세션의 작업 디렉토리 (터미널 너비에 맞게 축약)
- **Uptime** — 세션 실행 시간 (예: "2h 15m")
- **CPU** — 프로세스의 현재 CPU 사용률
- **Memory** — 상주 메모리(RSS) MB 단위
- **Context** — 컨텍스트 윈도우 사용률. Claude Code API가 statusline hook을 통해 제공하는 `context_window.used_percentage` 값을 그대로 표시합니다. TUI가 직접 계산하지 않습니다.

종료된 세션은 하단에 `[DEAD]` 표시와 함께 나타납니다. 패널 높이는 세션 수에 따라 자동으로 조절됩니다.

> 3초마다 갱신

### Agents (에이전트)

사용 가능한 모든 Claude Code 에이전트를 표시합니다 — 내장 에이전트(예: Explore, Plan, claude-code-guide)와 `~/.claude/agents/`의 사용자 정의 에이전트 모두 포함됩니다.

- **Name** — 에이전트 이름
- **Type** — `built-in` 또는 `user`
- **Color** — 에이전트에 설정된 색상 (컬러 미리보기 블록 포함)
- **Source** — 에이전트 정의 위치 (`system` 또는 `~/.claude/agents/`)

에이전트 디렉토리의 파일이 변경되면 자동으로 갱신됩니다.

### Messages (메시지)

Claude Code 사용의 활동 트렌드와 이력 통계를 표시합니다.

- **상단 요약 지표** — `Total Sess`, `Total Msgs`, `Today Sess` (▲/▼/━ 어제 대비 트렌드), `Today Msgs`
- **14일 라인 차트** — 최근 14일간 일별 메시지 수를 ASCII 라인 차트로 시각화. Y축 자동 스케일, X축 날짜 레이블(M/DD).
- **하단** — 가장 긴 세션 지속 시간, 최초 Claude Code 세션 날짜.

> 30초마다 갱신

### Hourly Activity (시간대별 활동)

24시간(00–23)에 걸친 메시지 분포를 세로 막대 차트로 표시합니다. 유니코드 블록 문자(▁▂▃▄▅▆▇█)를 사용하여 상대적 활동 수준을 나타냅니다.

> 30초마다 갱신

### Projects (프로젝트)

프로젝트별 토큰 사용량을 비례 막대 차트와 함께 표시합니다. 각 행에는 세션 수, 메시지 수, 도구 호출 수, 토큰 비율, 입출력 토큰 합계가 표시됩니다.

> 30초마다 갱신

### Tasks (태스크)

`~/.claude/tasks/`에 저장된 Claude Code 태스크를 표시합니다. 태스크는 Claude Code가 대화 중 다단계 작업을 추적하기 위해 생성합니다.

- **상태 아이콘** — `▶` 진행 중, `○` 대기, `✓` 완료
- **ID** — 세션 내 태스크 번호
- **Session** — Sessions 패널에 표시되는 Session ID와 매핑됩니다. 활성 세션의 경우 라이브 Session ID가 표시됩니다. `--resume`으로 재개되어 대화 ID가 다른 경우, 컨텍스트 데이터(PID 기반)를 통해 폴백 매핑합니다. 종료된 세션의 경우 원래 대화 ID가 표시됩니다.
- **Subject** — 태스크 설명

패널 라벨에 상태별 요약 카운트가 표시됩니다: `Tasks (N) [▶X ○Y ✓Z]`

> 30초마다 갱신

### Recent Prompts (최근 프롬프트)

모든 세션에서의 최근 10개 사용자 프롬프트를 최신순으로 표시합니다.

- **Date** — M/DD HH:MM 형식의 타임스탬프
- **Session** — Sessions 패널에 표시되는 Session ID와 매핑 (Tasks와 동일한 매핑 로직)
- **Prompt** — 프롬프트 텍스트 (첫 줄, 터미널 너비에 맞게 자름)

CJK(한국어, 중국어, 일본어) 문자의 시각적 너비가 올바르게 처리됩니다.

> 30초마다 갱신

### Status Bar (상태 바)

현재 모니터링 상태와 컨트롤을 보여주는 하단 바입니다.

- **키보드 단축키** — `[q]` 종료, `[r]` 수동 새로고침, `[c]` 종료된 세션 파일 정리
- **Polling** — 현재 폴링 간격 (3초)
- **갱신 표시** — 데이터 새로고침 중 애니메이션 스피너와 프로그레스 바, 비활성 시 "Idle"
- **Last Update** — 가장 최근 데이터 갱신 시각 (HH:MM:SS)

---

## 데이터 소스

| 데이터 | 소스 경로 | 설명 |
|--------|-----------|------|
| Sessions | `~/.claude/sessions/` | 활성 Claude Code 세션 파일 |
| Agents | `~/.claude/agents/` | 사용자 정의 에이전트 정의 파일 |
| Tasks | `~/.claude/tasks/` | 세션별 태스크 추적 파일 |
| History | `~/.claude/history.jsonl` | 최근 사용자 프롬프트 이력 |
| Usage | `~/.claude/projects/**/*.jsonl` | 세션 메시지 및 토큰 데이터 |
| Rate Limits | `.data/rate-limits-latest.json` | 현재 API Rate Limit 상태 (statusline 스크립트가 기록) |
| Context | `.data/contexts/*.json` | 세션별 컨텍스트 윈도우 사용량 (statusline 스크립트가 기록) |

---

## 키보드 단축키

| 키 | 동작 |
|----|------|
| `q` / `Ctrl+C` | 대시보드 종료 |
| `r` | 전체 데이터 수동 새로고침 |
| `c` | 종료된 세션 파일 정리 |

---

## License

MIT
