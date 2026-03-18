interface TutorHeaderProps {
  doctorName: string;
  groupName: string;
  moduleName: string;
  totalSessions: number;
  achievedSessions: number;
  achievementPercentage: number;
}

export default function TutorHeader({
  doctorName,
  groupName,
  moduleName,
  totalSessions,
  achievedSessions,
  achievementPercentage,
}: TutorHeaderProps) {
  return (
    <div className="mt-6 bg-gradient-to-r from-purple-600 via-blue-600 to-teal-600 rounded-2xl p-8 text-white shadow-xl">
      <div className="flex items-center justify-between">
        {/* Left Side - Doctor Info */}
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <i className="ri-user-star-line text-4xl"></i>
            </div>
            <div>
              <h2 className="text-3xl font-bold">{doctorName}</h2>
              <p className="text-purple-100 text-sm mt-1">Assigned Doctor</p>
            </div>
          </div>
          
          <div className="
          
          items-center gap-8 text-sm bg-white/10 backdrop-blur-sm rounded-xl px-6 py-3 inline-flex">
            <div className="flex items-center gap-2">
              <i className="ri-group-line text-xl"></i>
              <div>
                <div className="text-xs text-purple-100">Group</div>
                <div className="font-semibold">{groupName}</div>
              </div>
            </div>
            <div className="w-px h-8 bg-white/20"></div>
            <div className="flex items-center gap-2">
              <i className="ri-book-open-line text-xl"></i>
              <div>
                <div className="text-xs text-purple-100">Module</div>
                <div className="font-semibold">{moduleName}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - KPI Cards */}
        <div className="flex items-center gap-6">
          <div className="text-center bg-white/15 backdrop-blur-md rounded-2xl px-8 py-5 min-w-[140px] hover:bg-white/20 transition-all">
            <div className="text-4xl font-bold mb-1">{totalSessions}</div>
            <div className="text-xs text-purple-100 uppercase tracking-wide">Total Sessions</div>
          </div>
          
          <div className="text-center bg-white/15 backdrop-blur-md rounded-2xl px-8 py-5 min-w-[140px] hover:bg-white/20 transition-all">
            <div className="text-4xl font-bold mb-1">{achievedSessions}</div>
            <div className="text-xs text-purple-100 uppercase tracking-wide">Fully Achieved</div>
          </div>
          
          <div className="text-center bg-white/15 backdrop-blur-md rounded-2xl px-8 py-5 min-w-[140px] hover:bg-white/20 transition-all">
            <div className="flex items-baseline justify-center gap-1">
              <div className="text-4xl font-bold">{achievementPercentage.toFixed(1)}</div>
              <div className="text-2xl font-semibold">%</div>
            </div>
            <div className="text-xs text-purple-100 uppercase tracking-wide">Achievement Rate</div>
          </div>
        </div>
      </div>
    </div>
  );
}
