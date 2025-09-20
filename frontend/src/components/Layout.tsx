import { Outlet } from 'react-router-dom'
import Topbar from './Topbar'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div className="min-h-screen bg-sd-bg text-sd-text">
      <Topbar />
      <div className="mx-auto max-w-[1400px] px-4 py-4 grid grid-cols-12 gap-4">
        <aside className="col-span-12 md:col-span-3 lg:col-span-2">
          <Sidebar />
        </aside>
        <main className="col-span-12 md:col-span-9 lg:col-span-10">
          <div className="bg-sd-card rounded-2xl p-6 shadow-soft border border-sd-card-border">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
