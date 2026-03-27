export default function Layout({ darkMode, children }) {
  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-gray-100 dark:bg-[#0f172a] text-gray-900 dark:text-white">

        {/* HEADER */}
        <header className="bg-white dark:bg-[#1e293b] shadow-sm px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-orange-500">TruckPilot</h1>
        </header>

        {/* CONTENT */}
        <main className="p-6">
          {children}
        </main>

        {/* FOOTER */}
        <footer className="bg-white dark:bg-[#1e293b] text-center p-4 text-sm text-gray-500 dark:text-gray-400">
          TruckPilot © 2026
        </footer>

      </div>
    </div>
  );
}