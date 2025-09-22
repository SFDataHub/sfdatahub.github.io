import { useTranslation } from 'react-i18next'
export default function OldScans(){
  const { t } = useTranslation()
  return <h1 className="text-2xl font-semibold text-sd-title">{t('page.old.title')}</h1>
}
