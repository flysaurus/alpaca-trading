export default function WelcomeScreen({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div>
        <div className="text-5xl mb-4">🦊</div>
        <h1 className="text-3xl font-bold text-white">
          Welcome to Alpaca Terminal
        </h1>
        <p className="text-gray-400 mt-2">
          AI-powered trading advisor for smarter decisions
        </p>
      </div>

      <div className="space-y-3 bg-[#1e293b] rounded-lg p-4 text-sm">
        <div className="flex gap-3">
          <span>🔐</span>
          <div className="text-left">
            <p className="font-semibold text-white">Secure by default</p>
            <p className="text-gray-400">Keys encrypted, never exposed</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span>📊</span>
          <div className="text-left">
            <p className="font-semibold text-white">Real-time analysis</p>
            <p className="text-gray-400">AI advisor on every decision</p>
          </div>
        </div>
        <div className="flex gap-3">
          <span>⚡</span>
          <div className="text-left">
            <p className="font-semibold text-white">Paper trading</p>
            <p className="text-gray-400">Practice risk-free</p>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold transition"
      >
        Get Started
      </button>
    </div>
  );
}
