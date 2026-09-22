#!/usr/bin/env bash
set -e

echo "=== Generating Android and Web Icon Assets ==="

# 1. Generate Web icons
convert -background none -resize 192x192 public/icon.svg public/icon-192.png
convert -background none -resize 512x512 public/icon.svg public/icon-512.png

# 2. Generate Android Mipmap Icons
declare -A LAUNCHER_SIZES=( ["mdpi"]="48x48" ["hdpi"]="72x72" ["xhdpi"]="96x96" ["xxhdpi"]="144x144" ["xxxhdpi"]="192x192" )
declare -A FOREGROUND_SIZES=( ["mdpi"]="108x108" ["hdpi"]="162x162" ["xhdpi"]="216x216" ["xxhdpi"]="324x324" ["xxxhdpi"]="432x432" )

for DENSITY in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  DIR="android/app/src/main/res/mipmap-${DENSITY}"
  mkdir -p "$DIR"
  L_SIZE="${LAUNCHER_SIZES[$DENSITY]}"
  F_SIZE="${FOREGROUND_SIZES[$DENSITY]}"

  echo "Rendering $DENSITY: Launcher $L_SIZE, Foreground $F_SIZE"
  convert -background none -resize "$L_SIZE" public/icon.svg "$DIR/ic_launcher.png"
  convert -background none -resize "$L_SIZE" public/icon.svg "$DIR/ic_launcher_round.png"
  convert -background none -resize "$F_SIZE" public/icon-foreground.svg "$DIR/ic_launcher_foreground.png"
done

echo "=== Icon generation complete! ==="
