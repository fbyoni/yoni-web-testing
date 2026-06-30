#!/bin/bash
# Slim the mirrored CDN images in place to shrink the offline replica.
#  - JPEG: cap longest side at MAXDIM px, re-encode at quality QUAL
#  - PNG : cap longest side at MAXDIM px (lossless resample; no recompress)
# Filenames are preserved (HTML references exact paths). Each image is only
# replaced if the processed version is actually smaller. Originals remain
# recoverable from git history.
set -u
cd "$(dirname "$0")/.." || exit 1
ROOT="site/assets"
MAXDIM=1600
QUAL=72

processed=0; shrunk=0; saved=0; skipped=0
tmp="$(mktemp -t a24slim).img"
trap 'rm -f "$tmp"' EXIT

resize_arg() {                 # echo "-Z MAXDIM" if longest side > MAXDIM
  local f="$1"
  local dims w h
  dims="$(sips -g pixelWidth -g pixelHeight "$f" 2>/dev/null)"
  w="$(echo "$dims" | awk '/pixelWidth/{print $2}')"
  h="$(echo "$dims" | awk '/pixelHeight/{print $2}')"
  [ -z "$w" ] && return 1
  if [ "$w" -gt "$MAXDIM" ] || [ "$h" -gt "$MAXDIM" ]; then echo "-Z $MAXDIM"; fi
}

while IFS= read -r -d '' f; do
  processed=$((processed+1))
  ext="$(echo "${f##*.}" | tr 'A-Z' 'a-z')"
  before=$(stat -f%z "$f" 2>/dev/null || echo 0)
  rz="$(resize_arg "$f")" || { skipped=$((skipped+1)); continue; }

  case "$ext" in
    jpg|jpeg)
      sips -s format jpeg -s formatOptions "$QUAL" $rz "$f" --out "$tmp" >/dev/null 2>&1 || { skipped=$((skipped+1)); continue; }
      ;;
    png)
      # Only worth rewriting a PNG if we're actually downscaling it.
      [ -z "$rz" ] && { skipped=$((skipped+1)); continue; }
      sips $rz "$f" --out "$tmp" >/dev/null 2>&1 || { skipped=$((skipped+1)); continue; }
      ;;
    *) skipped=$((skipped+1)); continue ;;
  esac

  after=$(stat -f%z "$tmp" 2>/dev/null || echo 0)
  if [ "$after" -gt 0 ] && [ "$after" -lt "$before" ]; then
    cp "$tmp" "$f"
    shrunk=$((shrunk+1))
    saved=$((saved + before - after))
  else
    skipped=$((skipped+1))
  fi
  if [ $((processed % 200)) -eq 0 ]; then
    echo "  ...$processed processed, $shrunk shrunk, $((saved/1024/1024)) MB saved"
  fi
done < <(find "$ROOT" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \) -print0)

echo "DONE: processed=$processed shrunk=$shrunk skipped=$skipped saved=$((saved/1024/1024))MB"
