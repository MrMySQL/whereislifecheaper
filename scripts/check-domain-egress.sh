#!/usr/bin/env sh
# Does this host's egress get served by domain.com.au, or refused?
#
# The headers are load-bearing: a bare curl gets a 403 from an IP that is
# otherwise served just fine, so testing without them tells you nothing.
# `Accept-Encoding: gzip, deflate, br` is the one that decides it - Akamai wants
# Brotli advertised. Both flags below are needed: the explicit -H is what goes
# on the wire, and --compressed only makes curl decompress the reply so the
# greps below see markup. Do NOT drop the -H and rely on --compressed alone -
# it advertises `deflate, gzip`, turning a working egress into a 403.
# 200 + a non-empty __NEXT_DATA__ count = this egress works for the scraper.
URL='https://www.domain.com.au/rent/sydney-nsw-2000/?page=1'
BODY=$(mktemp)
CODE=$(curl -s --compressed --max-time 40 -o "$BODY" -w '%{http_code}' \
  -H 'Accept-Encoding: gzip, deflate, br' \
  -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8' \
  -H 'Accept-Language: en-AU,en;q=0.9' \
  -H 'sec-ch-ua: "Chromium";v="120", "Not(A:Brand";v="24", "Google Chrome";v="120"' \
  -H 'sec-ch-ua-mobile: ?0' -H 'sec-ch-ua-platform: "macOS"' \
  -H 'Sec-Fetch-Dest: document' -H 'Sec-Fetch-Mode: navigate' \
  -H 'Sec-Fetch-Site: none' -H 'Sec-Fetch-User: ?1' \
  -H 'Upgrade-Insecure-Requests: 1' "$URL")
echo "status:        $CODE"
echo "bytes:         $(wc -c < "$BODY" | tr -d ' ')"
echo "__NEXT_DATA__: $(grep -c '__NEXT_DATA__' "$BODY")"
echo "listingsMap:   $(grep -c 'listingsMap' "$BODY")"
[ "$CODE" = "200" ] && echo "=> egress WORKS for domain.com.au" || echo "=> egress REFUSED ($CODE)"
rm -f "$BODY"
