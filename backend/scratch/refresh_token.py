import asyncio
import os
from services.coral_service import coral
import db.database as database
from routers.settings import ensure_coral_tokens_loaded

async def main():
    await database.init_db()
    # Force os.environ to be empty so ensure_coral_tokens_loaded sees a difference
    os.environ.pop("GITHUB_TOKEN", None)
    os.environ.pop("GITHUB_OWNER", None)
    
    print("Forcing token refresh...")
    await ensure_coral_tokens_loaded(1)
    
    print("Checking github.user_repos after refresh...")
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
