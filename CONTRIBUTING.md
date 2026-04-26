# Contributing to OC World Record Museum

Thank you for helping preserve overclocking history! This guide explains how to
submit a new record, correct an existing one, or discuss a disputed entry.

## Discussing a Record

The easiest way to contribute is to open a **GitHub Issue**:
- Click the Issues tab and open a new issue
- Reference the record UID (e.g., `20260103_9005`) in the title
- Include your source links

## Submitting a New Record

1. **Fork** this repository
2. Create a new folder under the correct category:
   ```
   cpu/YYYYMMDD_valueMHz/
   gpu/YYYYMMDD_valueMHz/
   memory/YYYYMMDD_valueMHz/
   ```
   The UID format is: date (no dashes) + underscore + frequency in MHz
   (floor, no decimals). Example: `20260103_9130` for 9130.33 MHz on Jan 3 2026.

3. Copy `_template/record.json` into your new folder and fill in all fields.

4. Add any curated asset files (screenshots, validation images) to the same folder.

5. Open a **Pull Request** with:
   - A clear title: `Add record: [overclocker] [CPU] [freq] MHz [date]`
   - At least one verifiable source link in `record.json`
   - The PR description explaining where you found this record

## Record Requirements

For a record to be accepted it must have:
- ✅ A verifiable source (CPU-Z validation, HWBot entry, archived forum post, etc.)
- ✅ A precise date (approximate month/year accepted for pre-2000 records)
- ✅ The overclocked component identified
- ✅ At least one overclocker handle

Nice to have (not required):
- CPU-Z / GPU-Z screenshot in the record folder
- Motherboard, memory, and cooling details
- Tags

## Field Reference

| Field | Required | Notes |
|---|---|---|
| `uid` | ✅ | `YYYYMMDD_valueMHz` format |
| `category` | ✅ | `cpu`, `gpu`, or `memory` |
| `achieved_at` | ✅ | ISO 8601: `YYYY-MM-DD` |
| `achieved_at_approximate` | ✅ | `true` if only month/year known |
| `value_mhz` | ✅ | Full precision decimal |
| `hardware.primary` | ✅ | The overclocked component |
| `overclockers[].handle` | ✅ | Primary online handle |
| `sources` | ✅ | At least one source |
| `verified` | ✅ | Set to `false` for new submissions |
| `submitted_by` | — | Your GitHub handle |

## Correcting a Record

Open a PR editing the relevant `record.json`. Explain the correction and provide
a source. The git history serves as a permanent audit trail.

## Disputed Records

Open a GitHub Issue with the label `disputed`. Do not delete records — use the
`disputed` tag in `record.json` instead.