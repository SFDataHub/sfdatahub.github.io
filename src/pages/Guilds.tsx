import { useTranslation } from 'react-i18next'
export default function Guilds(){
  const { t } = useTranslation()
  return <h1 className="text-2xl font-semibold text-sd-title">{t('page.guilds.title')}</h1>
}
