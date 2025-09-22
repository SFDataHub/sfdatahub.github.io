import { useTranslation } from 'react-i18next'
export default function Scans(){
  const { t } = useTranslation()
  return <h1 className="text-2xl font-semibold text-sd-title">{t('page.scans.title')}</h1>
}
