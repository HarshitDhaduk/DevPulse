"use client";

type MetricConfig = {
  label: string;
  value_key: string;
  aggregation: "count" | "sum" | "avg";
  icon?: string;
  color?: string;
};

type MetricCardsWidgetProps = {
  data: any[];
  config: {
    cards: MetricConfig[];
  };
};

export default function MetricCardsWidget({ data = [], config }: MetricCardsWidgetProps) {
  const cards = config?.cards || [];

  const getMetricValue = (card: MetricConfig) => {
    if (!Array.isArray(data) || data.length === 0) return 0;

    const key = card.value_key;
    const agg = card.aggregation;

    if (agg === "count") {
      return data.length;
    }

    const numbers = data
      .map((row) => Number(row[key]))
      .filter((val) => !isNaN(val));

    if (numbers.length === 0) return 0;

    if (agg === "sum") {
      return numbers.reduce((acc, current) => acc + current, 0);
    }

    if (agg === "avg") {
      const sum = numbers.reduce((acc, current) => acc + current, 0);
      return Math.round((sum / numbers.length) * 10) / 10;
    }

    return 0;
  };

  const getGradient = (color?: string) => {
    switch (color) {
      case "green":
        return "from-emerald-500/10 to-teal-500/5 text-emerald border-emerald-500/20";
      case "blue":
        return "from-blue-500/10 to-indigo-500/5 text-blue border-blue-500/20";
      case "teal":
        return "from-teal-500/10 to-cyan-500/5 text-teal border-teal-500/20";
      case "coral":
      case "red":
        return "from-coral/10 to-rose-500/5 text-coral border-coral/20";
      case "yellow":
      case "orange":
        return "from-amber-500/10 to-yellow-500/5 text-amber-400 border-amber-500/20";
      default:
        return "from-bg3 to-bg2 text-text border-border";
    }
  };

  const renderIcon = (name?: string) => {
    switch (name) {
      case "check-square":
      case "check-circle":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        );
      case "git-pull-request":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 15V9a4 4 0 00-4-4H9" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9v6" />
          </svg>
        );
      case "git-merge":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9v6a3 3 0 003 3h0" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V6a3 3 0 013-3h3" />
          </svg>
        );
      case "alert-triangle":
      case "skull":
      case "bug":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
          </svg>
        );
    }
  };

  const getGridColsClass = (count: number) => {
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-1 sm:grid-cols-2";
    if (count === 3) return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3";
    return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
  };

  return (
    <div className={`grid ${getGridColsClass(cards.length)} gap-4 w-full`}>
      {cards.map((card, i) => (
        <div
          key={i}
          className={`flex items-center gap-4 p-5 rounded-xl border bg-gradient-to-br shadow-sm ${getGradient(
            card.color
          )}`}
        >
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-bg1 border border-border/30">
            {renderIcon(card.icon)}
          </div>
          <div>
            <div className="text-[11px] font-semibold tracking-wider font-mono uppercase text-text3 opacity-90">
              {card.label}
            </div>
            <div className="text-2xl font-bold font-display text-text mt-0.5">
              {getMetricValue(card)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
