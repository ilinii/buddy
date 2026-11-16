import { SpeechCredentials } from './SpeechCredentials';
export function GroqCredentials({onChange}:{onChange?():void}){return <SpeechCredentials provider="groq" onChange={onChange}/>;}
