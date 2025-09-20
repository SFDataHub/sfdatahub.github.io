import { useTranslation } from 'react-i18next'
export default function TopLists(){
  const { t } = useTranslation()
  return <h1 className="text-2xl font-semibold text-sd-title">{t('page.toplists.title')}</h1>
}
