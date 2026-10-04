#!/bin/sh
exec pi --provider cloudflare-workers-ai --model '@cf/moonshotai/kimi-k2.6' "$@"
