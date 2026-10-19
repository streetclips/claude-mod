export const MACOS = String.raw`
ObjC.import('AVFoundation')
ObjC.import('NaturalLanguage')

function run () {
  const env = $.NSProcessInfo.processInfo.environment
  const read = key => { const value = env.objectForKey(key); return value.isNil() ? '' : ObjC.unwrap(value) }
  const say = text => $.NSFileHandle.fileHandleWithStandardOutput.writeData($(text + '\n').dataUsingEncoding($.NSUTF8StringEncoding))
  const text = read('NARRATOR_TEXT')
  const wanted = read('NARRATOR_VOICE').toLowerCase()
  if (!text) return

  const found = $.NLLanguageRecognizer.dominantLanguageForString(text)
  const language = read('NARRATOR_LANG').toLowerCase().split('-')[0] || (found.isNil() ? 'en' : ObjC.unwrap(found))

  const all = $.AVSpeechSynthesisVoice.speechVoices
  const voices = []
  for (let i = 0; i < all.count; i++) {
    const voice = all.objectAtIndex(i)
    voices.push({ voice, id: ObjC.unwrap(voice.identifier), name: ObjC.unwrap(voice.name), lang: ObjC.unwrap(voice.language), quality: Number(voice.quality) })
  }

  // The regions to prefer for a language: the person's own (es-MX before es-ES), then the usual one.
  const regionsFor = language => {
    const regions = []
    const preferred = $.NSLocale.preferredLanguages
    for (let i = 0; i < preferred.count; i++) {
      const [lang, region] = ObjC.unwrap(preferred.objectAtIndex(i)).split('-')
      if (lang === language && region) regions.push(region)
    }
    const country = $.NSLocale.currentLocale.countryCode
    if (!country.isNil()) regions.push(ObjC.unwrap(country))
    regions.push({ de: 'DE', en: 'US', es: 'ES', fr: 'FR', it: 'IT', ja: 'JP', pt: 'BR', zh: 'CN' }[language] || '')
    return regions
  }
  // Siri's natural voices first, then premium over enhanced over compact, then the preferred region.
  // The novelty voices (Bahh, Grandpa...) come last.
  const best = language => {
    const regions = regionsFor(language)
    const near = v => { const at = regions.indexOf(v.lang.split('-')[1]); return at < 0 ? 0 : 50 - at * 10 }
    const score = v =>
      (v.id.includes('.siri.') ? 1000 : 0) + v.quality * 100 + near(v) - (v.id.includes('.super-compact.') ? 1 : 0) -
      (/\.(speech\.synthesis|eloquence)\./.test(v.id) ? 10000 : 0)
    return voices.filter(v => v.lang.split('-')[0] === language).sort((a, b) => score(b) - score(a))[0]
  }
  const named = wanted && voices.sort((a, b) => b.quality - a.quality).find(v => v.id.toLowerCase() === wanted || v.name.toLowerCase() === wanted)
  const picked = named || best(language) || best('en')

  const synth = $.AVSpeechSynthesizer.alloc.init
  const utterance = $.AVSpeechUtterance.speechUtteranceWithString(text)
  if (picked) utterance.voice = picked.voice
  say('voice ' + (picked ? picked.id : 'default'))
  synth.speakUtterance(utterance)

  const loop = $.NSRunLoop.currentRunLoop
  let started = false
  for (let i = 0; i < 6000; i++) {
    loop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1))
    say('.')
    if (synth.speaking) started = true
    else if (started || i > 30) break
  }
  if (!started) say('error: the synthesizer did not speak')
}
`

export const WINDOWS = String.raw`
$ErrorActionPreference = 'Stop'
$text = $env:NARRATOR_TEXT
$language = "$env:NARRATOR_LANG".ToLower().Split('-')[0]
$wanted = "$env:NARRATOR_VOICE"
if (-not $text) { exit 0 }
$region = (Get-Culture).Name
function Say($line) { [Console]::Out.WriteLine($line); [Console]::Out.Flush() }
Say "pid $PID"

# Among voices given as Name, Language and Item: the one named; else the language's, the person's
# region first; else English's, en-US first.
function Pick($voices) {
  if ($wanted) {
    $named = @($voices | Where-Object { $_.Name -eq $wanted -or $_.Name -like "*$wanted*" })
    if ($named.Count -gt 0) { return $named[0] }
  }
  foreach ($lang in @($language, 'en')) {
    if (-not $lang) { continue }
    $matching = @($voices | Where-Object { $_.Language.ToLower().Split('-')[0] -eq $lang })
    if ($matching.Count -eq 0) { continue }
    $preferred = if ($lang -eq $language) { $region } else { 'en-US' }
    $near = @($matching | Where-Object { $_.Language -eq $preferred })
    if ($near.Count -gt 0) { return $near[0] }
    return $matching[0]
  }
  return $null
}

$script:isSpeaking = $false

function Speak-OneCore {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
  $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  $voices = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | ForEach-Object { [pscustomobject]@{ Name = $_.DisplayName; Language = $_.Language; Item = $_ } })
  $picked = Pick $voices
  if ($picked) { $synth.Voice = $picked.Item }
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' } | Select-Object -First 1
  $task = $asTask.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]).Invoke($null, @($synth.SynthesizeTextToStreamAsync($text)))
  $null = $task.Wait(-1)
  $wav = New-Object System.IO.MemoryStream
  [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($task.Result.GetInputStreamAt(0)).CopyTo($wav)
  $bytes = $wav.ToArray()
  # How long it plays: the data after the 44-byte header, at the header's bytes per second.
  $seconds = ($bytes.Length - 44) / [Math]::Max([BitConverter]::ToInt32($bytes, 28), 1)
  $wav.Position = 0
  $player = New-Object System.Media.SoundPlayer($wav)
  $player.Load()
  $name = if ($picked) { $picked.Name } else { $synth.Voice.DisplayName }
  $script:isSpeaking = $true
  Say "voice $name"
  $player.Play()
  $end = (Get-Date).AddSeconds($seconds + 0.3)
  while ((Get-Date) -lt $end) { Start-Sleep -Milliseconds 100; Say '.' }
}

function Speak-Sapi {
  Add-Type -AssemblyName System.Speech
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { [pscustomobject]@{ Name = $_.VoiceInfo.Name; Language = $_.VoiceInfo.Culture.Name; Item = $_ } })
  $picked = Pick $voices
  if ($picked) { $synth.SelectVoice($picked.Name) }
  $script:isSpeaking = $true
  Say "voice $($synth.Voice.Name)"
  $spoken = $synth.SpeakAsync($text)
  while (-not $spoken.IsCompleted) { Start-Sleep -Milliseconds 100; Say '.' }
}

try {
  Speak-OneCore
} catch {
  if ($script:isSpeaking) { exit 0 }
  try { Speak-Sapi } catch { if (-not $script:isSpeaking) { Say "error: $($_.Exception.Message)" } }
}
`

export const LINUX = String.raw`
"$@" &
pid=$!
stop () {
  kill "$pid" 2>/dev/null
  if [ -n "$NARRATOR_STOP" ]; then $NARRATOR_STOP >/dev/null 2>&1; fi
  exit 0
}
trap stop TERM INT HUP PIPE
echo "voice $1"
while kill -0 "$pid" 2>/dev/null; do
  echo . 2>/dev/null || stop
  sleep 0.1
done
wait "$pid" || echo "error: $1 failed"
`

export function encodedCommand (script: string) {
  const bytes = new Uint8Array(script.length * 2)
  for (let i = 0; i < script.length; i++) {
    const code = script.charCodeAt(i)
    bytes[i * 2] = code & 0xff
    bytes[i * 2 + 1] = code >> 8
  }
  return bytes.toBase64()
}

export const powershell = (script: string, program = 'powershell') => [program, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand(script)]
