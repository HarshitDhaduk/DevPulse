import asyncio
from services.agent_service import coral

async def main():
    rows = await coral.query('SELECT * FROM github.issues LIMIT 1')
    if rows:
        print(rows[0].keys())

asyncio.run(main())
