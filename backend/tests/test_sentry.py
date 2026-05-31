import sqlite3
import httpx
import sys
import asyncio
from services.crypto import decrypt

async def main():
    conn = sqlite3.connect('db/devpulse.db')
    cursor = conn.execute("SELECT setting_val FROM user_settings WHERE setting_key='SENTRY_TOKEN'")
    row = cursor.fetchone()
    if not row:
        print("No SENTRY_TOKEN in db")
        return
    
    encrypted_token = row[0]
    token = decrypt(encrypted_token)
    
    print(f"Token starts with: {token[:10]}...")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(
            "https://sentry.io/api/0/users/me/organizations/",
            headers={"Authorization": f"Bearer {token}"}
        )
        print("Status:", res.status_code)
        print("Response:", res.text)

asyncio.run(main())
