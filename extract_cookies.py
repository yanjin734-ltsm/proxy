"""
Extract Perplexity cookies via Chrome DevTools Protocol (CDP).

Usage:
1. Start Perplexity desktop app with --remote-debugging-port=9222
   Or restart it: Stop-Process -Name Perplexity; Start-Process Perplexity.exe --remote-debugging-port=9222
2. Run this script: python extract_cookies.py
3. Cookies will be saved to perplexity_cookies.json
"""
import json
import asyncio
import sys

try:
    import websockets
except ImportError:
    print("Installing websockets...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets"])
    import websockets


async def get_cdp_ws_url(port=9222):
    """Get the WebSocket debugger URL from CDP."""
    import urllib.request
    try:
        response = urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=5)
        data = json.loads(response.read())
        return data.get("webSocketDebuggerUrl")
    except Exception as e:
        print(f"Error connecting to CDP on port {port}: {e}")
        print("Make sure Perplexity is running with --remote-debugging-port=9222")
        return None


async def get_cookies(ws_url):
    """Extract cookies via CDP WebSocket."""
    async with websockets.connect(ws_url) as ws:
        await ws.send(json.dumps({
            "id": 1,
            "method": "Storage.getCookies",
            "params": 
        }))

        response = await asyncio.wait_for(ws.recv(), timeout=10)
        msg = json.loads(response)

        if "result" in msg and "cookies" in msg["result"]:
            perplexity_cookies = [
                c for c in msg["result"]["cookies"]
                if "perplexity" in c.get("domain", "")
            ]
            cookie_dict = {c["name"]: c["value"] for c in perplexity_cookies}
            return cookie_dict
        return None


async def main():
    ws_url = await get_cdp_ws_url()
    if not ws_url:
        sys.exit(1)

    print(f"Connected to CDP: {ws_url[:50]}...")
    cookies = await get_cookies(ws_url)

    if cookies:
        print(f"Found {len(cookies)} Perplexity cookies")
        
        # Check for session token
        if "__Secure-next-auth.session-token" in cookies:
            print("Session token found - authenticated!")
        else:
            print("WARNING: No session token found. You may not be logged in.")

        # Save to file
        output_file = "perplexity_cookies.json"
        with open(output_file, "w") as f:
            json.dump(cookies, f, indent=2)
        print(f"Cookies saved to {output_file}")

        # Print compact version for PERPLEXITY_COOKIES env var
        compact = json.dumps(cookies, separators=(",", ":"))
        print(f"\nFor OpenCode MCP config, set PERPLEXITY_COOKIES to:")
        print(compact[:100] + "...")
    else:
        print("No cookies found!")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
