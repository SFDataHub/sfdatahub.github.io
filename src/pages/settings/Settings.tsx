import { useTranslation } from 'react-i18next'
export default function Settings(){
  const { t } = useTranslation()
  return <h1 className="text-2xl font-semibold text-sd-title">{t('page.settings.title')}</h1>
}
