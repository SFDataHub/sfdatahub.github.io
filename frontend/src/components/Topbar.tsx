import { useTranslation } from 'react-i18next'

export default function Topbar() {
  const { t, i18n } = useTranslation()
  return (
    <header className="bg-sd-nav border-b border-sd-card-border">
      <div className="mx-auto max-w-[1400px] px-4 h-14 flex items-center justify-between">
        <div className="font-semibold text-sd-title">{t('app.title')}</div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 rounded-2xl bg-sd-btn hover:bg-sd-btn-hover" onClick={() => i18n.changeLanguage('en')}>EN</button>
          <button className="px-3 py-1 rounded-2xl bg-sd-btn hover:bg-sd-btn-hover" onClick={() => i18n.changeLanguage('de')}>DE</button>
        </div>
      </div>
    </header>
  )
}
