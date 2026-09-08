import { useEffect } from 'react';

const STORAGE_KEY='lexoffice-theme';

export default function ThemeController(){
  useEffect(()=>{
    document.documentElement.dataset.lexTheme='dark';
    document.documentElement.style.colorScheme='dark';
    try{localStorage.setItem(STORAGE_KEY,'dark')}catch{}
  },[]);
  return null;
}
