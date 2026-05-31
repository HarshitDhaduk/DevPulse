import asyncio
import db.database as database
from routers.settings import get_user_tokens

async def main():
    await database.init_db()
    tokens = await get_user_tokens(3)
    print("User 3 tokens:")
    print("GITHUB_TOKEN:", repr(tokens.get("GITHUB_TOKEN")))
    print("GITHUB_OWNER:", repr(tokens.get("GITHUB_OWNER")))

if __name__ == "__main__":
    asyncio.run(main())
