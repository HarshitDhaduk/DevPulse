import asyncio
import os
from services.coral_service import coral
import db.database as database
from routers.settings import get_user_tokens
import sys

async def main():
    await database.init_db()
    # Assume user id 1
    tokens = await get_user_tokens(1)
    print("Tokens:", {k: v for k, v in tokens.items() if v})
    
    # Inject tokens
    for k, v in tokens.items():
        if v:
            os.environ[k] = v
            
    print("Checking github.user_repos...")
    try:
        await coral.start()
        rows = await coral.query("SELECT name, full_name FROM github.user_repos LIMIT 5")
        print("Rows:", rows)
    except Exception as e:
        print("Error:", e)
    finally:
        await coral.stop()

if __name__ == "__main__":
    asyncio.run(main())
