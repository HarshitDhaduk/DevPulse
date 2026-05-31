import asyncio
import sys
sys.path.append('.')
from services.agent_service import coral

async def main():
    await coral.start()
    rows = await coral.query("SELECT column_name FROM coral.columns WHERE table_name = 'issues' AND schema_name = 'linear'")
    if rows:
        print([r["column_name"] for r in rows])

asyncio.run(main())
