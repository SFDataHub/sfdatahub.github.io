import { NavLink, Link } from 'react-router-dom'
import { Home, BarChart3, Users, Settings, ListOrdered, Server, ScanEye, MessageSquare, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Logo from './Logo' // <-- ggf. Pfad anpassen

const linkBase =
  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm'
const sectionTitle =
  'px-3 pt-4 pb-2 text-xs uppercase tracking-wide text-sd-nav-text-inactive'

function Item({
  to,
  icon: Icon,
  label,
}: {
  to: string
  icon: any
  label: string
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          linkBase,
          isActive
            ? 'bg-sd-nav-active text-white'
            : 'text-sd-nav-text-inactive hover:bg-sd-tile-hover hover:text-white',
        ].join(' ')
      }
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </NavLink>
  )
}

export default function Sidebar() {
  const { t } = useTranslation()

  return (
    <div className="bg-sd-card rounded-2xl p-3 shadow-soft border border-sd-card-border flex flex-col min-h-[60vh]">
      {/* Header mit Logo */}
      <header className="mb-2">
        <Link
          to="/"
          aria-label="SFDataHub Home"
          className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-sd-tile-hover"
        >
          <Logo size={64} className="shrink-0" />
          {/* Wortmarke optional – auskommentieren wenn nicht gewünscht */}
          {/* <span className="text-white/90 font-semibold tracking-wide">SFDataHub</span> */}
        </Link>
      </header>

      {/* Navigation */}
      <div className="space-y-1">
        <Item to="/" icon={Home} label={t('nav.home')} />
        <Item to="/dashboard" icon={BarChart3} label={t('nav.dashboard')} />

        <div className={sectionTitle}>{t('nav.section.main')}</div>
        <Item to="/toplists" icon={ListOrdered} label={t('nav.toplists')} />
        <Item to="/guilds" icon={Users} label={t('nav.guilds')} />
        <Item to="/settings" icon={Settings} label={t('nav.settings')} />

        <div className={sectionTitle}>{t('nav.section.direct')}</div>
        <Item to="/players" icon={Users} label={t('nav.players')} />
        <Item to="/guild" icon={User} label={t('nav.guild')} />
        <Item to="/servers" icon={Server} label={t('nav.servers')} />
        <Item to="/toplists" icon={ListOrdered} label={t('nav.toplists')} />
        <Item to="/scans" icon={ScanEye} label={t('nav.scans')} />
        <Item to="/community" icon={MessageSquare} label={t('nav.community')} />
        <Item to="/settings" icon={Settings} label={t('nav.settings')} />
      </div>

      <div className="mt-auto pt-3">
        <button className="w-full px-3 py-2 rounded-xl bg-sd-btn hover:bg-sd-btn-hover text-left">
          Logout
        </button>
      </div>
    </div>
  )
}
