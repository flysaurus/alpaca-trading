export default function CompleteScreen({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div>
        <div className="text-5xl mb-4">✨</div>
        <h1 className="text-3xl font-bold text-white">
          All Set!
        </h1>
        <p className="text-gray-400 mt-2">
          Your Alpaca account is connected and secured
        </p>
      </div>

      <div className="bg-[#1e293b] rounded-lg p-4 space-y-3 text-left">
        <div className="flex items-center gap-2 text-green-400">
          <span>✓</span>
          <span className="text-sm">Alpaca keys encrypted</span>
        </div>
        <div className="flex items-center gap-2 text-green-400">
          <span>✓</span>
          <span className="text-sm">Master password set</span>
        </div>
        <div className="flex items-center gap-2 text-green-400">
          <span>✓</span>
          <span className="text-sm">Session created (24h)</span>
        </div>
      </div>

      <button
        onClick={onNext}
        className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold transition"
      >
        Launch Dashboard
      </button>
    </div>
  );
}
