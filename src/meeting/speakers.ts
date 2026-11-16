import type {Meeting} from './model';
export function detectedSpeakers(meeting:Meeting){
  const sources=new Map<string,Map<string,Set<string>>>();
  for(const segment of meeting.segments){
    if(!segment.final||!segment.speaker||!['microphone','system'].includes(segment.channel))continue;
    const match=segment.speaker.match(/^(microphone|system) · voice (\d+) · connection (\d+)$/);
    if(!match||match[1]!==segment.channel)continue;
    const connections=sources.get(segment.channel)??new Map<string,Set<string>>();
    const voices=connections.get(match[3])??new Set<string>();voices.add(match[2]);connections.set(match[3],voices);sources.set(segment.channel,connections);
  }
  // Labels restart per connection and source. Never sum reconnect labels into fictitious people.
  return [...sources].map(([source,connections])=>({source,count:Math.max(...[...connections.values()].map(v=>v.size)),reconnected:connections.size>1}));
}
