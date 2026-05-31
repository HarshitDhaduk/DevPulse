"""Quick test for Linear integration via Coral."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))

from services.coral_service import coral

async def test():
    await coral.start()
    try:
        # 1. List all Linear teams
        print("=== Linear Teams ===")
        teams = await coral.query("SELECT key, name FROM linear.teams LIMIT 10")
        for t in teams:
            print(f"  Team: {t.get('name')} | Key: {t.get('key')}")
        
        # 2. List recent Linear issues (no team filter)
        print("\n=== Recent Linear Issues (all teams) ===")
        issues = await coral.query(
            "SELECT title, state_id, priority_label, team_key "
            "FROM linear.issues ORDER BY created_at DESC LIMIT 10"
        )
        if issues:
            for i in issues:
                print(f"  [{i.get('team_key')}] {i.get('title')} | State: {i.get('state_id')} | Priority: {i.get('priority_label')}")
        else:
            print("  No issues found")
        
        # 3. List Linear cycles
        print("\n=== Linear Cycles ===")
        try:
            cycles = await coral.query("SELECT name, starts_at, ends_at FROM linear.cycles LIMIT 5")
            for c in cycles:
                print(f"  Cycle: {c.get('name')} | {c.get('starts_at')} → {c.get('ends_at')}")
        except Exception as e:
            print(f"  No cycles: {e}")

    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        await coral.stop()

if __name__ == "__main__":
    asyncio.run(test())
