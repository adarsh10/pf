/**
 * Race commentary.
 *
 * Browsers ship a speech synthesiser but no F1 commentary box, so the booth is
 * built here:
 *
 *  - TWO commentators. Speaker 0 is the lead, calling the action; speaker 1 is
 *    the colour man who reacts to it. A phrase-bank entry is either a single
 *    string (the lead alone) or an array, which is read as an exchange with the
 *    speakers alternating, starting from the lead.
 *  - FOUR language packs. `en` is a British broadcast pair; `hi` is a comedy
 *    Hindi booth; `bho` is a Bhojpuri booth; `or` is an Odia one. All the
 *    Indian commentators are men.
 *  - A pack may be written in a script no installed voice can read, in which
 *    case it carries a `render` hook that rewrites the text on the way to the
 *    synthesiser — see `OD`.
 *  - The commentary follows ONLY the player's car. Nothing is said about a
 *    battle the player is not in, and rivals are never named — they are "the car
 *    ahead", so the booth always sounds like it is watching one driver.
 *  - Lines are drawn from a SHUFFLE BAG rather than at random, so a bank is
 *    exhausted before anything repeats and no two races run the same order.
 *  - The booth stays LIVE. Queued lines expire, and a major call cuts off
 *    whatever is being said, because commentary that arrives after the moment
 *    is worse than no commentary at all.
 *
 * Everything is driven from race state that main.js already tracks, so the
 * commentators react to what actually happened rather than being scripted.
 */

/**
 * Draws from a bank without repeating until the bank is exhausted, then
 * reshuffles. Plain `Math.random` on a list of three will say the same line
 * twice in a row often enough to be noticed, and will run the same order race
 * after race; a shuffle bag cannot.
 *
 * The bag is keyed off the array itself, so callers just pass the bank.
 */
const bags = new WeakMap();

function pick(bank) {
  if (!Array.isArray(bank) || !bank.length) return bank;
  if (bank.length === 1) return bank[0];
  let bag = bags.get(bank);
  if (!bag || !bag.length) {
    bag = bank.map((_, i) => i);
    // Fisher-Yates.
    for (let i = bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // Never let a reshuffle repeat the line that just played.
    const last = bags.get(bank)?.last;
    if (last != null && bag[bag.length - 1] === last && bag.length > 1) {
      [bag[bag.length - 1], bag[0]] = [bag[0], bag[bag.length - 1]];
    }
    bags.set(bank, bag);
  }
  const idx = bag.pop();
  bag.last = idx;
  return bank[idx];
}

/* ================================================================== */
/* English                                                             */
/* ================================================================== */

const EN = {
  code: 'en-GB',
  // Preferred voices per speaker, best first. Two clearly different timbres, so
  // the lead and the colour man do not blur into one person.
  voices: [
    ['Daniel', 'Google UK English Male', 'Arthur', 'Oliver'],
    ['Serena', 'Google UK English Female', 'Kate', 'Stephanie', 'Karen'],
  ],
  // Voices the platform ships that are already male. Anything not on the list
  // is assumed female, and gets the `pitchAlt` value instead — see `_drain`.
  male: ['Daniel', 'Arthur', 'Oliver', 'Google UK English Male', 'Rishi', 'Alex'],
  voice: [
    { rate: 1.0, pitch: 0.92, pitchAlt: 0.92 },
    { rate: 0.94, pitch: 0.86, pitchAlt: 1.14 },
  ],
  ord: (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  },

  grid: (name, team, pos, ord) => [
    [`${name} lines up ${ord(pos)} on the grid for ${team}, here at the Buddh International Circuit.`,
     'A long way back, but this is a circuit where you can overtake. He will fancy his chances.'],
    [`${ord(pos)} on the grid for ${name}, the ${team} car sitting there in the evening light.`,
     'Not where he wanted to be. But there is a long way to go.'],
    [`It is ${name} for ${team}, and he starts this one from ${ord(pos)}.`,
     'Plenty of work to do. Fortunately this track gives you the tools to do it.'],
  ],
  intro: [
    ['Welcome to the Buddh International Circuit for the Indian Grand Prix.',
     'Sixteen corners, two enormous straights, and the sun going down over Greater Noida.'],
    ['A very good evening from Greater Noida, and welcome to the Indian Grand Prix.',
     'Five and a bit kilometres of it, and fourteen metres of elevation change. This is a special one.'],
    ['Hello and welcome to India, and to one of the great modern circuits.',
     'The light is going, the grandstands are full, and nobody here is sitting down.'],
    ['The Indian Grand Prix, and the Buddh International Circuit is ready for it.',
     'A lap that climbs, drops, and then asks you to be brave twice on the way round.'],
  ],
  lightsOut: [
    ["It's lights out and away we go!", 'And he has got a good launch off the line!'],
    ['Lights out — and they are racing in India!', 'Straight into the climb towards Turn 1.'],
    ['And they are away! Clean getaway from the grid.', 'Everybody through Turn 1 in one piece.'],
    ['The lights go out and the race is on!',
     'Wheels spinning, and the whole field funnels into that first climb.'],
  ],
  lapStart: (lap, total, pos, ord) => [
    `Starting lap ${lap} of ${total}, and he is running ${ord(pos)}.`,
    `Lap ${lap} of ${total} now. ${ord(pos)} place.`,
    `That is ${lap} of ${total} underway, still ${ord(pos)}.`,
    `Onto lap ${lap}. ${total} in all, and he holds ${ord(pos)}.`,
  ],
  lastLap: [
    ['Last lap! Everything on the line now.', 'No second chances. This is it.'],
    ['This is the final lap of the Indian Grand Prix.', 'Whatever he has left, it goes in now.'],
    ['Last time round!', 'Five kilometres between him and the flag.'],
  ],
  tookLead: [
    ['And that is the lead! He has taken the lead of the race!',
     'What a drive. From the back of the grid to the front.'],
    ['He is through, and he is into the lead!',
     'Nobody ahead of him now. Clear air, and the race in his hands.'],
    ['The lead of the Indian Grand Prix changes hands!',
     'And you have to say, thoroughly deserved.'],
  ],
  gained: (pos, ord) => [
    [`Down the inside — and he is through! Up to ${ord(pos)}!`, 'Beautifully judged, that.'],
    [`That is a fine overtake. ${ord(pos)} place now.`, 'He had that one lined up a corner early.'],
    [`He makes the move stick! ${ord(pos)}.`, 'Brave. Really brave.'],
  ],
  lost: (pos, ord) => [
    [`And he loses a place. Down to ${ord(pos)}.`, 'He will want that one back.'],
    [`That drops him to ${ord(pos)}.`, 'Nothing he could do there.'],
    [`Round the outside — ${ord(pos)} now.`, 'Out-braked, plain and simple.'],
    [`A place lost. ${ord(pos)}.`, 'That is the trouble with defending here.'],
  ],
  drs: [
    ['He is in DRS range. This could be a move.', 'Wing open — and closing fast.'],
    ['Inside a second. DRS armed.', 'Watch this into the braking zone.'],
    ['The wing is open down the straight.', 'He only needs one shot at this.'],
    ['DRS available, and the gap is tumbling.', 'Here we go.'],
  ],
  offTrack: [
    ['Oh, that is a mistake! Off into the run-off.', 'That has cost him.'],
    ['He has lost it! Ran out of road.', 'Too greedy on the exit.'],
    ['Too much kerb — and he is off.', 'Lucky there is room out there.'],
    ['That is a moment! Wide, and off the circuit.', 'He got away with it. Just.'],
    ['Locked up and went straight on.', 'Flat spot on that front left.'],
  ],
  wall: [
    ['Into the barrier! That is contact.', 'That will have hurt the car.'],
    ['He has hit the wall, and hard.', 'Damage there, and damage costs lap time.'],
    ['Contact with the barrier on the exit.', 'Ooh. That is a heavy one.'],
  ],
  finish: (pos, total, ord) =>
    pos === 1
      ? [['Chequered flag — and that is the win! A brilliant drive!',
          'From the back of the grid to the top step. Superb.'],
         ['He takes the flag and wins the Indian Grand Prix!',
          'A quite extraordinary afternoon of racing.']]
      : pos <= 3
        ? [[`Chequered flag — a podium! ${ord(pos)} at the Indian Grand Prix.`,
            'He earned every bit of that.'],
           [`And that is ${ord(pos)}, and a place on the podium.`,
            'A really strong drive from where he started.']]
        : [[`Chequered flag. ${ord(pos)} of ${total} after a hard race.`,
            'Plenty to build on there.'],
           [`He crosses the line ${ord(pos)} of ${total}.`,
            'Not the result he wanted. But he never stopped trying.']],
  idle: [
    'The Buddh International Circuit, bathed in the last of the evening sun.',
    'Sixteen corners, and a lap that climbs and falls all the way round.',
    'Track temperature dropping now as the sun goes down over Noida.',
    'Two enormous straights, and a lap that rewards a brave car.',
    ['That elevation change through the first sector is deceptive on television.',
     'It is far steeper than it looks from up here.'],
    'Greater Noida, and the crowd is packed in along the pit straight.',
    ['A proper drivers circuit, this.', 'Fast, flowing, and unforgiving of any scruff.'],
  ],
  corners: {
    'Turn 1': [
      'Hard on the brakes for Turn 1, and the track climbs away from him.',
      'Into Turn 1, a long right that just keeps going.',
    ],
    'Turn 3': [
      ['Over the crest at Turn 3 — completely blind.', 'And then the drop to the back straight.'],
      'Turn 3, the highest point of the circuit.',
    ],
    'Turn 4': [
      'Down the hill and hard on the brakes for Turn 4. Biggest stop of the lap.',
      ['Turn 4 — over three hundred metres of braking.', 'The car is squirming under him.'],
    ],
    'Turn 10': ['Into the long banked right at Turn 10.'],
    'Turn 11': [
      ['Turn 11, still turning, still on the banking.', 'It goes on forever, this corner.'],
      'That double-apex right is the signature corner of this place.',
    ],
    'Turn 16': ['Last corner, and onto the pit straight.'],
  },
};

/* ================================================================== */
/* Hindi                                                               */
/* ================================================================== */

/**
 * A comedy Hindi booth. Both commentators are men.
 *
 *  - Speaker 0 is the analyst: crisp, precise, cricket metaphors, "देखिए".
 *  - Speaker 1 is the showman: shayari, wild similes, "ठोको ताली!".
 *
 * The joke only lands if the straight man goes first, so the analyst always
 * calls the action and the showman always gets the punchline. Everything is in
 * Devanagari because that is the only script a `hi-IN` voice will read.
 */
const HI = {
  code: 'hi-IN',
  voices: [
    ['Neel', 'Hemant', 'Google हिन्दी', 'Google हिंदी', 'Lekha', 'Kiara'],
    ['Hemant', 'Neel', 'Google हिन्दी', 'Google हिंदी', 'Lekha', 'Kiara'],
  ],
  male: ['Neel', 'Hemant', 'Rishi', 'Google हिन्दी', 'Google हिंदी'],
  // Both men. macOS often ships only `Lekha`, which is female, so when the
  // resolved voice is not on the `male` list the pitch drops to pull it into a
  // male register — see `_drain`. Not further: below about 0.35 the
  // synthesiser stops sounding like a man and starts sounding like a monster.
  voice: [
    { rate: 1.02, pitch: 0.86, pitchAlt: 0.50 },
    { rate: 0.95, pitch: 0.68, pitchAlt: 0.40 },
  ],
  ord: (n) => ['', 'पहले', 'दूसरे', 'तीसरे', 'चौथे', 'पाँचवें', 'छठे',
               'सातवें', 'आठवें', 'नौवें', 'दसवें'][n] || `${n}वें`,

  grid: (name, team, pos, ord) => [
    [`देखिए, ${name}, ${team} की गाड़ी में, ग्रिड पर ${ord(pos)} स्थान से शुरुआत कर रहे हैं।`,
     'ठोको ताली! पीछे से शुरू करने वाला ही तो असली शेर होता है, मेरे यार! ' +
     'जैसे शादी में सबसे आख़िर में आने वाला मेहमान सबसे ज़्यादा खाता है!'],
    [`${team} के ${name} आज ${ord(pos)} स्थान से शुरू कर रहे हैं।`,
     'अरे भाई, जगह पीछे है, पर इरादा सबसे आगे का है! ठोको ताली!'],
    [`ग्रिड पर ${ord(pos)} स्थान — ${name}, ${team} के लिए।`,
     'लंबा रास्ता है, गुरु। पर लंबे रास्ते पर ही तो असली ड्राइवर पहचाना जाता है!'],
  ],
  intro: [
    ['नमस्कार, और स्वागत है आपका बुद्ध इंटरनेशनल सर्किट पर, इंडियन ग्रैंड प्री में।',
     'वाह गुरु, वाह! सूरज ढल रहा है, इंजन गरज रहे हैं — ' +
     'ये शाम कुछ ऐसी है जैसे गन्ने के खेत में मोर नाच रहा हो! ठोको ताली!'],
    ['जी हाँ, ग्रेटर नोएडा से नमस्कार। सवा पाँच किलोमीटर, सोलह मोड़, दो लंबी सीधी सड़कें।',
     'अरे भाई साहब, ये ट्रैक तो वो कढ़ाई है जिसमें कच्चा खिलाड़ी डालो — जल जाता है, ' +
     'और पक्का खिलाड़ी डालो — सोना बन के निकलता है!'],
  ],
  lightsOut: [
    ['लाइट्स आउट — और रेस शुरू हो गई है!',
     'निकल पड़े! जैसे सास के जाते ही बहू का फ़ोन चलता है — वैसी रफ़्तार है! ठोको ताली!'],
    ['बत्तियाँ बुझीं, और ये चल पड़े हैं टर्न वन की चढ़ाई की तरफ़!',
     'अरे ये तो पहली ही गेंद पर छक्का मार दिया, मेरे यार!'],
  ],
  lapStart: (lap, total, pos, ord) => [
    `देखिए, ${total} में से ${lap}वाँ लैप शुरू हो चुका है, और वो ${ord(pos)} स्थान पर चल रहे हैं।`,
    `${lap}वाँ लैप, ${total} में से। ${ord(pos)} स्थान पर हैं।`,
    `अब ${lap}वाँ चक्कर शुरू। स्थान वही — ${ord(pos)}।`,
  ],
  lastLap: [
    ['आख़िरी लैप! अब सब कुछ दाँव पर लगा है।',
     'अब या तो हीरो, या ज़ीरो! जैसे परीक्षा का आख़िरी पेपर — ' +
     'सारी साल की मेहनत अब तीन मिनट में तय होगी! ठोको ताली!'],
    ['यही आख़िरी चक्कर है इंडियन ग्रैंड प्री का।',
     'जो बचा है, सब अभी लगा दो, मेरे यार! बाद में बचा के क्या करोगे?'],
    ['आख़िरी बार! अब वापसी नहीं।',
     'सवा पाँच किलोमीटर, और उसके बाद इतिहास लिखा जाएगा!'],
  ],
  tookLead: [
    ['और वो अब सबसे आगे हैं! रेस की बढ़त इनके पास आ गई है!',
     'सबसे आगे! सबसे आगे! अरे भाई, ये तो वो बात हो गई — ' +
     'कि जो पीछे बैठा था, वही आज दूल्हे के घोड़े पर सवार है! ठोको ताली!'],
    ['बढ़त इनके नाम! अब आगे कोई नहीं।',
     'खुला मैदान, साफ़ रास्ता! अब तो बस हवा से रेस है, गुरु!'],
    ['इंडियन ग्रैंड प्री की बढ़त बदल गई है!',
     'और मानना पड़ेगा — पूरी तरह हक़ से ली है ये बढ़त!'],
  ],
  gained: (pos, ord) => [
    [`अंदर से घुसे, ब्रेक देर से लगाया — और निकल गए! अब ${ord(pos)} स्थान पर।`,
     'क्या ओवरटेक था! जैसे कवर ड्राइव — गेंद गई, फ़ील्डर देखता रह गया!'],
    [`शानदार! एक और गाड़ी पीछे छोड़ दी। अब ${ord(pos)} स्थान पर हैं।`,
     'ये तो एक मोड़ पहले ही सोच लिया था इन्होंने! अक्ल का इस्तेमाल, गुरु, अक्ल का!'],
    [`उन्होंने जगह बना ली, और मोड़ अपने नाम कर लिया! ${ord(pos)} स्थान।`,
     'दिल चाहिए इसके लिए, मेरे यार, सिर्फ़ पैर नहीं! ठोको ताली!'],
  ],
  lost: (pos, ord) => [
    [`और एक स्थान हाथ से निकल गया। अब ${ord(pos)} पर आ गए हैं।`,
     'कोई बात नहीं! जो गिरता है वही तो उठता है। अगले मोड़ पर वापस ले लेंगे!'],
    [`वो खिसक कर ${ord(pos)} स्थान पर आ गए हैं।`,
     'अरे ये तो वो हाल हो गया — जैसे लाइन में लगे थे, और कोई बीच में घुस गया!'],
  ],
  drs: [
    ['देखिए, डी आर एस की रेंज में आ गए हैं। यहाँ मौका बन सकता है।',
     'पंख खुल गए! अब ये बाज़ की तरह झपटेगा, मेरे यार!'],
    ['एक सेकंड के अंदर — डी आर एस तैयार है। ब्रेकिंग ज़ोन पर नज़र रखिए।',
     'दबाव! दबाव! जैसे प्रेशर कुकर की तीसरी सीटी — अब कुछ भी हो सकता है!'],
  ],
  offTrack: [
    ['अरे! ये तो ग़लती हो गई — रेसिंग लाइन से बाहर, सीधे रन-ऑफ़ में।',
     'हाय हाय! ये तो वो बात हो गई — दूल्हा घोड़े से उतर के पैदल चल पड़ा!'],
    ['काबू छूट गया, और ट्रैक ही ख़त्म हो गया वहाँ।',
     'ज़्यादा लालच किया, मेरे यार! और लालच का फल हमेशा घास में ही मिलता है!'],
    ['बहुत ज़्यादा कर्ब ले लिया — और गाड़ी बाहर।',
     'शुक्र मनाइए कि यहाँ जगह बहुत है, वरना आज तस्वीर कुछ और होती!'],
  ],
  wall: [
    ['दीवार से टक्कर! ये तो सीधा संपर्क हो गया।',
     'ओह हो हो! गाड़ी को चोट लग गई। दीवार तो वहीं की वहीं है, गुरु — हिली भी नहीं!'],
    ['ज़ोरदार टक्कर! गाड़ी को नुक़सान हुआ है।',
     'अरे बाप रे! दीवार से दोस्ती महँगी पड़ती है, मेरे यार!'],
  ],
  finish: (pos, total, ord) =>
    pos === 1
      ? [['चेकर्ड फ़्लैग — और ये जीत है! क्या शानदार ड्राइव थी!',
          'जीत गए! जीत गए! अरे मिठाई मँगवाओ, ढोल बजाओ! ' +
          'पीछे से शुरू किया, और सबसे आगे ख़त्म किया — ठोको ताली!'],
         ['झंडी गिर गई, और जीत इनके नाम!',
          'आज का दिन याद रखा जाएगा, मेरे यार! लिख के ले लो!']]
      : pos <= 3
        ? [[`चेकर्ड फ़्लैग — और ये पोडियम है! इंडियन ग्रैंड प्री में ${ord(pos)} स्थान।`,
            'पोडियम! अरे ये तो शादी के खाने में गुलाब जामुन मिल गया, मेरे यार!'],
           [`${ord(pos)} स्थान, और पोडियम पक्का!`,
            'शुरुआत जहाँ से हुई थी, वहाँ से ये कमाल है! ठोको ताली!']]
        : [[`चेकर्ड फ़्लैग। ${total} में से ${ord(pos)} स्थान, एक कड़ी रेस के बाद।`,
            'कोई बात नहीं! हार भी उसी की होती है जो मैदान में उतरता है। ' +
            'अगली बार डबल मज़ा आएगा!'],
           [`लाइन पार की — ${total} में से ${ord(pos)} स्थान।`,
            'नतीजा मन का नहीं मिला, पर हिम्मत आख़िर तक नहीं टूटी, गुरु!']],
  idle: [
    'बुद्ध इंटरनेशनल सर्किट, ढलती शाम की सुनहरी रोशनी में।',
    ['सोलह मोड़, और एक लैप जो लगातार चढ़ता और उतरता है।',
     'ऊपर-नीचे, ऊपर-नीचे — जैसे शेयर बाज़ार, मेरे यार!'],
    'सूरज ढल रहा है, और ट्रैक का तापमान गिरता जा रहा है।',
    ['दो लंबी सीधी सड़कें — यहाँ हिम्मत वाली गाड़ी को इनाम मिलता है।',
     'यहाँ डरने वाला घर जाता है, और लड़ने वाला ट्रॉफ़ी!'],
    ['पहले सेक्टर की चढ़ाई टीवी पर उतनी नहीं दिखती।',
     'दिखती नहीं, पर लगती बहुत है! जैसे ससुराल का बिल!'],
    'ग्रेटर नोएडा, और पिट स्ट्रेट पर दर्शकों की भीड़ जमी हुई है।',
    ['ये असली ड्राइवर का सर्किट है — तेज़, बहता हुआ, और ग़लती माफ़ नहीं करता।',
     'ये ट्रैक बेईमानी नहीं सहता, गुरु। यहाँ मेहनत बोलती है! ठोको ताली!'],
  ],
  corners: {
    'Turn 1': [
      ['टर्न वन के लिए ज़ोरदार ब्रेकिंग, और ट्रैक यहाँ से ऊपर चढ़ता है।',
       'चढ़ाई पर मुड़ना — ये तो पहाड़ पर साइकिल चलाने जैसा है, मेरे यार!'],
      'टर्न वन — एक लंबा दायाँ मोड़ जो ख़त्म होने का नाम ही नहीं लेता।',
    ],
    'Turn 3': [
      ['टर्न थ्री की चोटी — आगे कुछ दिखाई ही नहीं देता।',
       'आँख बंद करके भरोसा! जैसे सास के हाथ का खाना — देखो मत, बस खा लो!'],
      'टर्न थ्री, इस पूरे सर्किट का सबसे ऊँचा हिस्सा।',
    ],
    'Turn 4': [
      'ढलान से नीचे, और टर्न फ़ोर के लिए ज़ोरदार ब्रेक। लैप की सबसे बड़ी ब्रेकिंग यही है।',
      ['टर्न फ़ोर — तीन सौ मीटर से ज़्यादा की ब्रेकिंग।',
       'गाड़ी काँप रही है नीचे! जैसे नतीजे वाले दिन का विद्यार्थी!'],
    ],
    'Turn 10': ['टर्न टेन के लंबे बैंक्ड दाएँ मोड़ में दाख़िल हो रहे हैं।'],
    'Turn 11': [
      ['टर्न इलेवन — अब भी मुड़ रहे हैं, अब भी बैंकिंग पर हैं।',
       'ये मोड़ ख़त्म ही नहीं होता! जैसे सरकारी दफ़्तर की लाइन!'],
      'यही डबल-एपेक्स दायाँ मोड़ इस सर्किट की असली पहचान है।',
    ],
    'Turn 16': ['आख़िरी मोड़, और सीधे पिट स्ट्रेट पर।'],
  },
};

/* ================================================================== */
/* Bhojpuri                                                            */
/* ================================================================== */

/**
 * The Bhojpuri booth: loudest of the three, and the least interested in
 * technical analysis.
 *
 *  - Speaker 0 is the caller, in plain Bhojpuri: "देखीं", "हो गइल".
 *  - Speaker 1 is the entertainer, in full stage voice: "का बात बा!",
 *    "बलमा", village similes, and a lot of shouting.
 *
 * No browser ships a `bho` voice, so the pack renders on a `hi-IN` voice —
 * which is fine, because Bhojpuri is written in Devanagari and a Hindi
 * synthesiser reads it out perfectly intelligibly. Both commentators are men,
 * and `voice` pushes the pitch down hard for the same reason as the Hindi pack.
 */
const BH = {
  code: 'hi-IN',
  voices: [
    ['Neel', 'Hemant', 'Google हिन्दी', 'Google हिंदी', 'Lekha', 'Kiara'],
    ['Hemant', 'Neel', 'Google हिन्दी', 'Google हिंदी', 'Lekha', 'Kiara'],
  ],
  male: ['Neel', 'Hemant', 'Rishi', 'Google हिन्दी', 'Google हिंदी'],
  voice: [
    { rate: 1.06, pitch: 0.80, pitchAlt: 0.46 },
    { rate: 1.0, pitch: 0.62, pitchAlt: 0.36 },
  ],
  ord: (n) => ['', 'पहिला', 'दूसरा', 'तीसरा', 'चौथा', 'पाँचवाँ', 'छठवाँ',
               'सातवाँ', 'आठवाँ', 'नौवाँ', 'दसवाँ'][n] || `${n}वाँ`,

  grid: (name, team, pos, ord) => [
    [`देखीं, ${name}, ${team} के गाड़ी में, ग्रिड पर ${ord(pos)} नंबर पर बाड़न।`,
     'का बात बा! पीछे से चलेवाला ही त आगे जाला, हो! ' +
     'जइसे बरात में सबसे पाछे वाला सबसे जादा नाचेला!'],
    [`${team} के ${name} आज ${ord(pos)} नंबर से शुरू करत बाड़न।`,
     'अरे भइया, जगह पाछे बा, बाकिर मन त सबसे आगे बा! का कहीं!'],
    [`ग्रिड पर ${ord(pos)} नंबर — ${name}, ${team} खातिर।`,
     'रस्ता लमहर बा हो, बाकिर लमहर रस्ता पर ही असली मरद पहचानाला!'],
  ],
  intro: [
    ['परनाम बा, स्वागत बा रउआ सभे के बुद्ध इंटरनेशनल सर्किट पर, इंडियन ग्रैंड प्री में।',
     'का बात बा! सूरज ढलत बा, इंजन गरजत बा — ' +
     'ई शाम त अइसन बा जइसे सावन में गाँव के मेला! का कहीं!'],
    ['ग्रेटर नोएडा से परनाम। सवा पाँच किलोमीटर, सोलह मोड़, दू गो लमहर सीधा सड़क।',
     'अरे भइया, ई ट्रैक त ऊ चूल्हा ह — कच्चा खिलाड़ी जरी, ' +
     'आ पक्का खिलाड़ी सोना बन के निकली!'],
    ['नमस्कार बा! इंडियन ग्रैंड प्री शुरू होखे वाला बा।',
     'गैलरी भरल बा, बाजा बजत बा, आ केहू बइठल नइखे! ठोकीं ताली!'],
  ],
  lightsOut: [
    ['बत्ती बुझ गइल — आ रेस शुरू हो गइल!',
     'निकल पड़लन! अरे ई त अइसन भागलन जइसे बरात में मिठाई बँटत होखे!'],
    ['लाइट्स आउट, आ ई सब टर्न वन के चढ़ाई ओर बढ़त बाड़न!',
     'पहिलहीं गेंद पर छक्का, हो! का बात बा!'],
    ['आ ई चल पड़लन! साफ़ शुरुआत भइल।',
     'धुआँ उड़त बा, माटी उड़त बा — मजा आ गइल भइया!'],
  ],
  lapStart: (lap, total, pos, ord) => [
    `देखीं, ${total} में से ${lap}वाँ लैप शुरू हो गइल, आ ऊ ${ord(pos)} नंबर पर बाड़न।`,
    `${lap}वाँ लैप बा, ${total} में से। ${ord(pos)} नंबर पर बाड़न।`,
    `अब ${lap}वाँ चक्कर। जगह ओहि — ${ord(pos)}।`,
  ],
  lastLap: [
    ['आख़िरी लैप! अब सब कुछ दाँव पर बा।',
     'अब या त हीरो, या ज़ीरो! जइसे परीक्षा के आख़िरी घंटा — अब कुछो हो सकेला!'],
    ['इहे आख़िरी चक्कर ह इंडियन ग्रैंड प्री के।',
     'जे बचल बा, सब लगा दीं हो! बचा के का करब?'],
    ['आख़िरी बेर! अब लौटल ना होई।',
     'सवा पाँच किलोमीटर, आ ओकरा बाद नाम लिखाई! का बात बा!'],
  ],
  tookLead: [
    ['आ ऊ अब सबसे आगे बाड़न! रेस के बढ़त इनकर हो गइल!',
     'सबसे आगे! सबसे आगे! अरे जे पाछे बइठल रहे, ऊहे आज घोड़ा पर सवार बा! ठोकीं ताली!'],
    ['बढ़त इनके नाम! अब आगे केहू नइखे।',
     'खुलल मैदान, साफ़ रस्ता! अब त हवा से रेस बा, हो!'],
    ['इंडियन ग्रैंड प्री के बढ़त बदल गइल!',
     'आ मानहीं के पड़ी — पूरा हक़ से लेहले बाड़न!'],
  ],
  gained: (pos, ord) => [
    [`अंदर से घुसलन, देर से ब्रेक मारलन — आ निकल गइलन! अब ${ord(pos)} नंबर पर।`,
     'का ओवरटेक रहे! जइसे कवर ड्राइव — गेंद गइल, फ़ील्डर देखते रह गइल!'],
    [`बढ़िया! एगो आउर गाड़ी पाछे छोड़ दिहलन। अब ${ord(pos)} नंबर पर बाड़न।`,
     'ई त एगो मोड़ पहिलहीं सोच लेहले रहलन! दिमाग़ लगावल जाला हो, खाली गोड़ ना!'],
    [`जगह बनवलन, आ मोड़ अपना नाम कर लिहलन! ${ord(pos)} नंबर।`,
     'करेजा चाहीं एकरा खातिर, भइया! ठोकीं ताली!'],
    [`एगो आउर आगे! अब ${ord(pos)} नंबर पर।`,
     'अरे ई त लाइन में सबके पाछे छोड़त चलत बाड़न! का बात बा!'],
  ],
  lost: (pos, ord) => [
    [`आ एगो जगह हाथ से निकल गइल। अब ${ord(pos)} नंबर पर आ गइलन।`,
     'कवनो बात ना! जे गिरेला ऊहे उठेला। अगिला मोड़ पर वापस ले लेब!'],
    [`ऊ खिसक के ${ord(pos)} नंबर पर आ गइलन।`,
     'अरे ई त ऊ हाल भइल — लाइन में लागल रहनी, आ केहू बीच में घुस गइल!'],
    [`बाहर से निकल गइल — अब ${ord(pos)} नंबर।`,
     'ब्रेक में मात खा गइलन हो। कवनो बात ना, आगे मौका बा!'],
  ],
  drs: [
    ['देखीं, डी आर एस के रेंज में आ गइलन। इहाँ मौका बन सकेला।',
     'पंख खुल गइल! अब ई बाज़ नियर झपटी, हो!'],
    ['एक सेकंड के भीतर — डी आर एस तैयार बा। ब्रेकिंग ज़ोन पर नज़र राखीं।',
     'दबाव! दबाव! जइसे कुकर के तीसरा सीटी — अब कुछो हो सकेला!'],
    ['पंख खुलल बा सीधा सड़क पर।',
     'एक्के मौका चाहीं इनका, आ ऊ आ गइल बा! का बात बा!'],
  ],
  offTrack: [
    ['अरे! ई त ग़लती हो गइल — रेसिंग लाइन से बाहर, सीधा रन-ऑफ़ में।',
     'हाय हाय! दूल्हा घोड़ा से उतर के पैदल चल पड़लन!'],
    ['काबू छूट गइल, आ ट्रैक ख़तम हो गइल ओहिजा।',
     'जादा लालच कइलन हो! आ लालच के फल हमेशा घास में मिलेला!'],
    ['बहुत जादा कर्ब ले लिहलन — आ गाड़ी बाहर।',
     'शुकर मनाईं कि इहाँ जगह बहुत बा, ना त आज तस्वीर दोसर होखित!'],
    ['ब्रेक जाम भइल आ सीधा निकल गइलन।',
     'टायर पर निशान पड़ गइल, हो। ई महँगा पड़ी!'],
  ],
  wall: [
    ['देवाल से टक्कर! सीधा भिड़ंत हो गइल।',
     'अरे बाप रे! गाड़ी के चोट लाग गइल। देवाल त ओहिजे बा — हिललो ना!'],
    ['जोरदार टक्कर! गाड़ी के नुक़सान भइल बा।',
     'देवाल से दोस्ती महँगा पड़ेला भइया! का कहीं!'],
  ],
  finish: (pos, total, ord) =>
    pos === 1
      ? [['चेकर्ड फ़्लैग — आ ई जीत बा! का शानदार ड्राइव रहे!',
          'जीत गइलन! जीत गइलन! अरे मिठाई मँगावीं, ढोलक बजावीं! ' +
          'पाछे से शुरू कइलन, आ सबसे आगे ख़तम कइलन — ठोकीं ताली!'],
         ['झंडी गिर गइल, आ जीत इनके नाम!',
          'आज के दिन याद रही, भइया! लिख के राख लीं!']]
      : pos <= 3
        ? [[`चेकर्ड फ़्लैग — आ ई पोडियम बा! इंडियन ग्रैंड प्री में ${ord(pos)} नंबर।`,
            'पोडियम! अरे ई त बरात के खाना में रसगुल्ला मिल गइल, हो!'],
           [`${ord(pos)} नंबर, आ पोडियम पक्का!`,
            'जहाँ से शुरू भइल रहे, ओहिजा से ई कमाल बा! का बात बा!']]
        : [[`चेकर्ड फ़्लैग। ${total} में से ${ord(pos)} नंबर, एगो कड़ा रेस के बाद।`,
            'कवनो बात ना! हार ओहि के होला जे मैदान में उतरेला। अगिला बेर डबल मजा आई!'],
           [`लाइन पार कइलन — ${total} में से ${ord(pos)} नंबर।`,
            'नतीजा मन के ना मिलल, बाकिर हिम्मत आख़िर तक ना टूटल, हो!']],
  idle: [
    'बुद्ध इंटरनेशनल सर्किट, ढलत साँझ के सुनहरा रोशनी में।',
    ['सोलह मोड़, आ एगो लैप जे लगातार चढ़ेला आ उतरेला।',
     'ऊपर-नीचे, ऊपर-नीचे — जइसे बाज़ार के भाव, हो!'],
    'सूरज ढलत बा, आ ट्रैक के तापमान गिरत जात बा।',
    ['दू गो लमहर सीधा सड़क — इहाँ हिम्मत वाला गाड़ी के इनाम मिलेला।',
     'इहाँ डरेवाला घरे जाला, आ लड़ेवाला ट्रॉफ़ी ले जाला!'],
    ['पहिला सेक्टर के चढ़ाई टीवी पर ओतना ना लउके।',
     'लउके ना, बाकिर लागेला बहुत! जइसे ससुरारी के ख़र्चा!'],
    'ग्रेटर नोएडा, आ पिट स्ट्रेट पर भीड़ जमल बा।',
    ['ई असली ड्राइवर के सर्किट ह — तेज़, बहत, आ ग़लती माफ़ ना करे।',
     'ई ट्रैक बेईमानी ना सहे, हो। इहाँ मेहनत बोलेला! ठोकीं ताली!'],
    ['गाड़ी के आवाज़ सुनीं — पूरा गाँव ले सुनाई देत होई!',
     'अरे ई त बरात के बैंड से भी जादा शोर बा! का बात बा!'],
  ],
  corners: {
    'Turn 1': [
      ['टर्न वन खातिर जोरदार ब्रेक, आ ट्रैक इहाँ से ऊपर चढ़ेला।',
       'चढ़ाई पर मुड़ल — ई त पहाड़ पर साइकिल चलावे नियर बा, हो!'],
      'टर्न वन — एगो लमहर दहिना मोड़ जे ख़तम होखे के नाम ना लेत।',
    ],
    'Turn 3': [
      ['टर्न थ्री के चोटी — आगे कुछो ना लउके।',
       'आँख मूँद के भरोसा! जइसे माई के हाथ के खाना — देखीं मत, बस खा लीं!'],
      'टर्न थ्री, ई पूरा सर्किट के सबसे ऊँच जगह।',
    ],
    'Turn 4': [
      'ढलान से नीचे, आ टर्न फ़ोर खातिर जोरदार ब्रेक। लैप के सबसे बड़ ब्रेकिंग इहे बा।',
      ['टर्न फ़ोर — तीन सौ मीटर से जादा के ब्रेकिंग।',
       'गाड़ी काँपत बा नीचे! जइसे नतीजा वाला दिन के लइका!'],
    ],
    'Turn 10': ['टर्न टेन के लमहर बैंक्ड दहिना मोड़ में घुसत बाड़न।'],
    'Turn 11': [
      ['टर्न इलेवन — अबहियों मुड़त बाड़न, अबहियों बैंकिंग पर बाड़न।',
       'ई मोड़ ख़तमे ना होत! जइसे सरकारी दफ़्तर के लाइन!'],
      'इहे डबल-एपेक्स दहिना मोड़ ई सर्किट के असली पहचान ह।',
    ],
    'Turn 16': ['आख़िरी मोड़, आ सीधा पिट स्ट्रेट पर।'],
  },
};

/* ================================================================== */
/* Odia                                                                */
/* ================================================================== */

/** Odia letters that have no Bengali counterpart, and their nearest match. */
const OD_GAPS = {
  '\u0B33': '\u09B2', // ḷa  -> la
  '\u0B35': '\u09AC', // va  -> ba
  '\u0B71': '\u09AC', // wa  -> ba
};

/**
 * Rewrite Odia text into Bengali codepoints so a `bn-IN` voice will read it.
 *
 * The Indic Unicode blocks are all laid out in the same ISCII-derived order,
 * so Odia (U+0B00) and Bengali (U+0980) line up character for character at a
 * fixed 0x180 offset — ଅ/অ, କ/ক, ୍/্, ୦/০ and so on all fall straight out of
 * the arithmetic. Only the three letters Bengali does not have need a table.
 *
 * Anything outside the Odia block — Latin driver names, digits, punctuation —
 * is passed through untouched.
 */
function odiaToBengali(text) {
  let out = '';
  for (const ch of text) {
    const gap = OD_GAPS[ch];
    if (gap) { out += gap; continue; }
    const c = ch.codePointAt(0);
    out += c >= 0x0b01 && c <= 0x0b7f ? String.fromCodePoint(c - 0x180) : ch;
  }
  return out;
}

/**
 * The Odia booth: warm, theatrical, and fond of a proverb.
 *
 *  - Speaker 0 is the caller: steady, plain Odia, "ଦେଖନ୍ତୁ".
 *  - Speaker 1 is the entertainer, in jatra stage voice: rasagola, Chilika,
 *    the Puri crowd, and "ଟାଳି ମାରନ୍ତୁ!".
 *
 * SCRIPT NOTE. No platform ships an Odia (`or`) voice, and Odia script handed
 * to a voice that cannot read it comes out as silence. So the lines below are
 * written in real Odia — which is what makes them reviewable — and `render`
 * transliterates them to Bengali codepoints on the way to the synthesiser,
 * where `Piya (bn-IN)` reads them aloud.
 *
 * This is a closer match than it sounds. Odia and Bengali share the same
 * ISCII-derived character order and, crucially, the same inherent vowel (ɔ,
 * not the Hindi ə), so a Bengali synthesiser pronounces Odia far more
 * faithfully than a Hindi one reading a Devanagari transliteration would.
 *
 * The menu label stays in Odia script, because that is only ever rendered as
 * text and never spoken.
 */
const OD = {
  code: 'bn-IN',
  render: odiaToBengali,
  voices: [
    ['Sagar', 'Bashkar', 'Google বাংলা', 'Piya'],
    ['Bashkar', 'Sagar', 'Piya', 'Google বাংলা'],
  ],
  male: ['Sagar', 'Bashkar'],
  // macOS ships only `Piya`, who is female, so in practice both booths land on
  // `pitchAlt`. Same floor as the other Indian packs — see `_drain`.
  voice: [
    { rate: 1.0, pitch: 0.84, pitchAlt: 0.52 },
    { rate: 0.94, pitch: 0.66, pitchAlt: 0.44 },
  ],
  ord: (n) => ['', 'ପ୍ରଥମ', 'ଦ୍ୱିତୀୟ', 'ତୃତୀୟ', 'ଚତୁର୍ଥ', 'ପଞ୍ଚମ', 'ଷଷ୍ଠ',
               'ସପ୍ତମ', 'ଅଷ୍ଟମ', 'ନବମ', 'ଦଶମ'][n] || `${n} ନମ୍ବର`,

  grid: (name, team, pos, ord) => [
    [`ଦେଖନ୍ତୁ, ${name}, ${team} ଗାଡ଼ିରେ, ଗ୍ରିଡ ଉପରେ ${ord(pos)} ସ୍ଥାନରୁ ଆରମ୍ଭ କରୁଛନ୍ତି।`,
     'ଟାଳି ମାରନ୍ତୁ! ପଛରୁ ଆରମ୍ଭ କରିବା ଲୋକ ହିଁ ଶେଷରେ ଆଗକୁ ଯାଏ, ଭାଇ! ' +
     'ଯେମିତି ଭୋଜିରେ ଶେଷରେ ବସିଲା ଲୋକ ସବୁଠାରୁ ବେଶି ଖାଏ!'],
    [`${team} ର ${name} ଆଜି ${ord(pos)} ସ୍ଥାନରୁ ଆରମ୍ଭ କରୁଛନ୍ତି।`,
     'ଆରେ ଭାଇ, ଜାଗା ପଛରେ, ହେଲେ ମନ ସବୁଠାରୁ ଆଗରେ! କଣ କହିବି!'],
    [`ଗ୍ରିଡ ଉପରେ ${ord(pos)} ସ୍ଥାନ — ${name}, ${team} ପାଇଁ।`,
     'ରାସ୍ତା ଲମ୍ବା ଅଛି, ହେଲେ ଲମ୍ବା ରାସ୍ତାରେ ହିଁ ଅସଲି ଚାଳକ ଚିହ୍ନା ପଡ଼େ!'],
  ],
  intro: [
    ['ନମସ୍କାର, ସ୍ୱାଗତ ଅଛି ବୁଦ୍ଧ ଇଣ୍ଟରନ୍ୟାସନାଲ ସର୍କିଟକୁ, ଇଣ୍ଡିଆନ ଗ୍ରାଣ୍ଡ ପ୍ରିରେ।',
     'ଆହା, କଣ ଦୃଶ୍ୟ! ସୂର୍ଯ୍ୟ ବୁଡ଼ୁଛି, ଇଞ୍ଜିନ ଗର୍ଜୁଛି — ' +
     'ଏ ସନ୍ଧ୍ୟା ଠିକ୍ ଚିଲିକା ଉପରେ ସୂର୍ଯ୍ୟାସ୍ତ ପରି! ଟାଳି ମାରନ୍ତୁ!'],
    ['ଗ୍ରେଟର ନୋଏଡ଼ାରୁ ନମସ୍କାର। ସୋଆ ପାଞ୍ଚ କିଲୋମିଟର, ଷୋହଳ ମୋଡ଼, ଦୁଇଟି ଲମ୍ବା ସିଧା ରାସ୍ତା।',
     'ଆରେ ଭାଇ, ଏ ଟ୍ରାକ ସେହି ଚୁଲି — କଞ୍ଚା ଖେଳାଳି ପୋଡ଼ିଯିବ, ' +
     'ଆଉ ପକ୍କା ଖେଳାଳି ସୁନା ହୋଇ ବାହାରିବ!'],
    ['ନମସ୍କାର! ଇଣ୍ଡିଆନ ଗ୍ରାଣ୍ଡ ପ୍ରି ଆରମ୍ଭ ହେବାକୁ ଯାଉଛି।',
     'ଗ୍ୟାଲେରି ଭରିଯାଇଛି, ବାଜା ବାଜୁଛି, ଆଉ କେହି ବସି ନାହାନ୍ତି! ଟାଳି ମାରନ୍ତୁ!'],
  ],
  lightsOut: [
    ['ବତି ଲିଭିଲା — ଆଉ ଦୌଡ଼ ଆରମ୍ଭ ହୋଇଗଲା!',
     'ବାହାରି ଗଲେ! ଆରେ ଏମିତି ଦୌଡ଼ିଲେ ଯେମିତି ଭୋଜିରେ ରସଗୋଲା ବଣ୍ଟା ହେଉଛି!'],
    ['ଲାଇଟ୍ସ ଆଉଟ୍, ଆଉ ସମସ୍ତେ ଟର୍ନ ୱାନ ଚଢ଼ାଣ ଆଡ଼କୁ ଯାଉଛନ୍ତି!',
     'ପ୍ରଥମ ବଲରେ ଛକା, ଭାଇ! କଣ କହିବି!'],
    ['ଆଉ ସେମାନେ ବାହାରି ଗଲେ! ପରିଷ୍କାର ଆରମ୍ଭ ହେଲା।',
     'ଧୂଆଁ ଉଡ଼ୁଛି, ଧୂଳି ଉଡ଼ୁଛି — ମଜା ଆସିଗଲା ଭାଇ!'],
  ],
  lapStart: (lap, total, pos, ord) => [
    `ଦେଖନ୍ତୁ, ${total} ମଧ୍ୟରୁ ${lap} ନମ୍ବର ଲ୍ୟାପ ଆରମ୍ଭ ହୋଇଗଲା, ଆଉ ସେ ${ord(pos)} ସ୍ଥାନରେ ଅଛନ୍ତି।`,
    `${lap} ନମ୍ବର ଲ୍ୟାପ, ${total} ମଧ୍ୟରୁ। ${ord(pos)} ସ୍ଥାନରେ ଅଛନ୍ତି।`,
    `ଏବେ ${lap} ନମ୍ବର ଚକ୍କର। ସ୍ଥାନ ସେଇଆ — ${ord(pos)}।`,
  ],
  lastLap: [
    ['ଶେଷ ଲ୍ୟାପ! ଏବେ ସବୁ କିଛି ଦାଅରେ ଅଛି।',
     'ଏବେ ହୁଏତ ହିରୋ, ନହେଲେ ଜିରୋ! ଯେମିତି ପରୀକ୍ଷାର ଶେଷ ଘଣ୍ଟା!'],
    ['ଏଇଟି ହିଁ ଇଣ୍ଡିଆନ ଗ୍ରାଣ୍ଡ ପ୍ରିର ଶେଷ ଚକ୍କର।',
     'ଯାହା ବଳକା ଅଛି, ସବୁ ଲଗାଇ ଦିଅନ୍ତୁ! ବଞ୍ଚାଇ ରଖି କଣ କରିବେ?'],
    ['ଶେଷ ଥର! ଏବେ ଆଉ ଫେରିବା ନାହିଁ।',
     'ସୋଆ ପାଞ୍ଚ କିଲୋମିଟର, ଆଉ ତା ପରେ ନାଁ ଲେଖା ହେବ! ଟାଳି ମାରନ୍ତୁ!'],
  ],
  tookLead: [
    ['ଆଉ ସେ ଏବେ ସବୁଠାରୁ ଆଗରେ! ଦୌଡ଼ର ଅଗ୍ରଗତି ତାଙ୍କ ପାଖରେ!',
     'ସବୁଠାରୁ ଆଗରେ! ଆରେ ଯିଏ ପଛରେ ବସିଥିଲା, ସେ ଆଜି ସବୁଙ୍କ ଆଗରେ! ଟାଳି ମାରନ୍ତୁ!'],
    ['ଅଗ୍ରଗତି ତାଙ୍କ ନାଁରେ! ଏବେ ଆଗରେ କେହି ନାହାନ୍ତି।',
     'ଖୋଲା ମଇଦାନ, ପରିଷ୍କାର ରାସ୍ତା! ଏବେ ପବନ ସହିତ ଦୌଡ଼!'],
    ['ଇଣ୍ଡିଆନ ଗ୍ରାଣ୍ଡ ପ୍ରିର ଅଗ୍ରଗତି ବଦଳିଗଲା!',
     'ଆଉ ମାନିବାକୁ ପଡ଼ିବ — ପୂରା ହକ୍‌ରେ ନେଇଛନ୍ତି!'],
  ],
  gained: (pos, ord) => [
    [`ଭିତରୁ ପଶିଲେ, ଡେରିରେ ବ୍ରେକ ମାରିଲେ — ଆଉ ବାହାରି ଗଲେ! ଏବେ ${ord(pos)} ସ୍ଥାନରେ।`,
     'କଣ ଓଭରଟେକ୍! ଯେମିତି କଭର ଡ୍ରାଇଭ୍ — ବଲ ଗଲା, ଫିଲ୍ଡର ଚାହିଁ ରହିଗଲା!'],
    [`ବଢ଼ିଆ! ଆଉ ଗୋଟିଏ ଗାଡ଼ି ପଛରେ ଛାଡ଼ି ଦେଲେ। ଏବେ ${ord(pos)} ସ୍ଥାନରେ ଅଛନ୍ତି।`,
     'ଏଇଟା ଗୋଟିଏ ମୋଡ଼ ଆଗରୁ ଭାବି ସାରିଥିଲେ! ମୁଣ୍ଡ ଲଗାଇବାକୁ ପଡ଼େ, ଖାଲି ପାଦ ନୁହେଁ!'],
    [`ଜାଗା ତିଆରି କଲେ, ଆଉ ମୋଡ଼ ନିଜ ନାଁରେ କରିନେଲେ! ${ord(pos)} ସ୍ଥାନ।`,
     'ଏଥିପାଇଁ ସାହସ ଦରକାର, ଭାଇ! ଟାଳି ମାରନ୍ତୁ!'],
    [`ଆଉ ଗୋଟିଏ ଆଗକୁ! ଏବେ ${ord(pos)} ସ୍ଥାନରେ।`,
     'ଆରେ ଏ ତ ଧାଡ଼ିରେ ସମସ୍ତଙ୍କୁ ପଛରେ ଛାଡ଼ି ଚାଲିଛନ୍ତି! କଣ କହିବି!'],
  ],
  lost: (pos, ord) => [
    [`ଆଉ ଗୋଟିଏ ସ୍ଥାନ ହାତରୁ ଚାଲିଗଲା। ଏବେ ${ord(pos)} ସ୍ଥାନରେ ଆସିଗଲେ।`,
     'କିଛି କଥା ନାହିଁ! ଯିଏ ପଡ଼େ ସେ ହିଁ ଉଠେ। ପରବର୍ତ୍ତୀ ମୋଡ଼ରେ ଫେରାଇ ନେବେ!'],
    [`ସେ ଖସି ${ord(pos)} ସ୍ଥାନକୁ ଆସିଗଲେ।`,
     'ଆରେ ଏ ତ ସେଇ ଅବସ୍ଥା — ଧାଡ଼ିରେ ଠିଆ ହୋଇଥିଲେ, ଆଉ କେହି ମଝିରେ ପଶିଗଲା!'],
    [`ବାହାରୁ ବାହାରି ଗଲେ — ଏବେ ${ord(pos)} ସ୍ଥାନ।`,
     'ବ୍ରେକରେ ହାରି ଗଲେ ଭାଇ। କିଛି କଥା ନାହିଁ, ଆଗରେ ସୁଯୋଗ ଅଛି!'],
  ],
  drs: [
    ['ଦେଖନ୍ତୁ, ଡି ଆର ଏସ୍ ରେଞ୍ଜ ଭିତରକୁ ଆସିଗଲେ। ଏଠାରେ ସୁଯୋଗ ମିଳିପାରେ।',
     'ଡେଣା ଖୋଲିଗଲା! ଏବେ ବାଜ ପରି ଝାମ୍ପିବ, ଭାଇ!'],
    ['ଏକ ସେକେଣ୍ଡ ଭିତରେ — ଡି ଆର ଏସ୍ ପ୍ରସ୍ତୁତ। ବ୍ରେକିଂ ଜୋନ ଉପରେ ନଜର ରଖନ୍ତୁ।',
     'ଚାପ! ଚାପ! ଯେମିତି କୁକରର ତୃତୀୟ ସିଟି — ଏବେ ଯାହା ବି ହୋଇପାରେ!'],
    ['ସିଧା ରାସ୍ତାରେ ଡେଣା ଖୋଲା ଅଛି।',
     'ଗୋଟିଏ ସୁଯୋଗ ଦରକାର ଥିଲା, ଆଉ ସେଇଟା ଆସିଗଲା! ଟାଳି ମାରନ୍ତୁ!'],
  ],
  offTrack: [
    ['ଆରେ! ଏ ତ ଭୁଲ ହୋଇଗଲା — ରେସିଂ ଲାଇନରୁ ବାହାରେ, ସିଧା ରନ-ଅଫ୍‌ରେ।',
     'ହାୟ ହାୟ! ବରଯାତ୍ରୀ ଘୋଡ଼ାରୁ ଓହ୍ଲାଇ ଚାଲି ପଡ଼ିଲେ!'],
    ['ନିୟନ୍ତ୍ରଣ ଛାଡ଼ିଗଲା, ଆଉ ସେଠାରେ ଟ୍ରାକ ସରିଗଲା।',
     'ବେଶି ଲୋଭ କଲେ ଭାଇ! ଆଉ ଲୋଭର ଫଳ ସବୁବେଳେ ଘାସରେ ମିଳେ!'],
    ['ବହୁତ ବେଶି କର୍ବ ନେଇଗଲେ — ଆଉ ଗାଡ଼ି ବାହାରେ।',
     'ଭାଗ୍ୟ ଭଲ ଯେ ଏଠାରେ ଜାଗା ବହୁତ, ନହେଲେ ଆଜି ଚିତ୍ର ଅଲଗା ହୋଇଥାନ୍ତା!'],
    ['ବ୍ରେକ ଜାମ ହେଲା ଆଉ ସିଧା ବାହାରି ଗଲେ।',
     'ଟାୟାରରେ ଦାଗ ପଡ଼ିଗଲା, ଭାଇ। ଏଇଟା ମହଙ୍ଗା ପଡ଼ିବ!'],
  ],
  wall: [
    ['କାନ୍ଥରେ ଧକ୍କା! ସିଧା ଭିଡ଼ନ୍ତ ହୋଇଗଲା।',
     'ଆରେ ବାପରେ! ଗାଡ଼ିରେ ଚୋଟ ଲାଗିଗଲା। କାନ୍ଥ ତ ସେଇଠି ଅଛି — ଟଳିଲା ବି ନାହିଁ!'],
    ['ଜୋରଦାର ଧକ୍କା! ଗାଡ଼ିର କ୍ଷତି ହୋଇଛି।',
     'କାନ୍ଥ ସହିତ ବନ୍ଧୁତା ମହଙ୍ଗା ପଡ଼େ ଭାଇ! କଣ କହିବି!'],
  ],
  finish: (pos, total, ord) =>
    pos === 1
      ? [['ଚେକର୍ଡ ଫ୍ଲାଗ — ଆଉ ଏଇଟା ଜିତ! କଣ ଅସାଧାରଣ ଡ୍ରାଇଭ୍ ଥିଲା!',
          'ଜିତିଗଲେ! ଜିତିଗଲେ! ଆରେ ରସଗୋଲା ମଗାନ୍ତୁ, ଢୋଲ ବଜାନ୍ତୁ! ' +
          'ପଛରୁ ଆରମ୍ଭ କଲେ, ଆଉ ସବୁଠାରୁ ଆଗରେ ଶେଷ କଲେ — ଟାଳି ମାରନ୍ତୁ!'],
         ['ଝଣ୍ଡା ପଡ଼ିଗଲା, ଆଉ ଜିତ ତାଙ୍କ ନାଁରେ!',
          'ଆଜିର ଦିନ ମନେ ରହିବ, ଭାଇ! ଲେଖି ରଖନ୍ତୁ!']]
      : pos <= 3
        ? [[`ଚେକର୍ଡ ଫ୍ଲାଗ — ଆଉ ଏଇଟା ପୋଡିୟମ! ଇଣ୍ଡିଆନ ଗ୍ରାଣ୍ଡ ପ୍ରିରେ ${ord(pos)} ସ୍ଥାନ।`,
            'ପୋଡିୟମ! ଆରେ ଏ ତ ଭୋଜିରେ ରସଗୋଲା ମିଳିଗଲା, ଭାଇ!'],
           [`${ord(pos)} ସ୍ଥାନ, ଆଉ ପୋଡିୟମ ପକ୍କା!`,
            'ଯେଉଁଠୁ ଆରମ୍ଭ ହୋଇଥିଲା, ସେଠାରୁ ଏଇଟା କମାଲ! କଣ କହିବି!']]
        : [[`ଚେକର୍ଡ ଫ୍ଲାଗ। ${total} ମଧ୍ୟରୁ ${ord(pos)} ସ୍ଥାନ, ଗୋଟିଏ କଠିନ ଦୌଡ଼ ପରେ।`,
            'କିଛି କଥା ନାହିଁ! ହାର ମଧ୍ୟ ତାଙ୍କର ହୁଏ ଯିଏ ମଇଦାନକୁ ଆସେ। ପରଥର ଡବଲ ମଜା!'],
           [`ଲାଇନ ପାର କଲେ — ${total} ମଧ୍ୟରୁ ${ord(pos)} ସ୍ଥାନ।`,
            'ଫଳ ମନ ଭଳି ମିଳିଲା ନାହିଁ, ହେଲେ ସାହସ ଶେଷ ପର୍ଯ୍ୟନ୍ତ ଭାଙ୍ଗିଲା ନାହିଁ!']],
  idle: [
    'ବୁଦ୍ଧ ଇଣ୍ଟରନ୍ୟାସନାଲ ସର୍କିଟ, ବୁଡ଼ୁଥିବା ସନ୍ଧ୍ୟାର ସୁନେଲି ଆଲୁଅରେ।',
    ['ଷୋହଳ ମୋଡ଼, ଆଉ ଗୋଟିଏ ଲ୍ୟାପ ଯାହା ଲଗାତାର ଚଢ଼େ ଓ ଓହ୍ଲାଏ।',
     'ଉପର-ତଳ, ଉପର-ତଳ — ଯେମିତି ବଜାରର ଦର, ଭାଇ!'],
    'ସୂର୍ଯ୍ୟ ବୁଡ଼ୁଛି, ଆଉ ଟ୍ରାକର ତାପମାତ୍ରା ଖସୁଛି।',
    ['ଦୁଇଟି ଲମ୍ବା ସିଧା ରାସ୍ତା — ଏଠାରେ ସାହସୀ ଗାଡ଼ି ପୁରସ୍କାର ପାଏ।',
     'ଏଠାରେ ଡରୁଥିବା ଲୋକ ଘରକୁ ଯାଏ, ଆଉ ଲଢ଼ୁଥିବା ଲୋକ ଟ୍ରଫି ନିଏ!'],
    ['ପ୍ରଥମ ସେକ୍ଟରର ଚଢ଼ାଣ ଟିଭିରେ ସେତେ ଦେଖାଯାଏ ନାହିଁ।',
     'ଦେଖାଯାଏ ନାହିଁ, ହେଲେ ଲାଗେ ବହୁତ! ଯେମିତି ଶାଶୁଘରର ଖର୍ଚ୍ଚ!'],
    'ଗ୍ରେଟର ନୋଏଡ଼ା, ଆଉ ପିଟ ଷ୍ଟ୍ରେଟରେ ଦର୍ଶକଙ୍କ ଭିଡ଼ ଜମିଛି।',
    ['ଏଇଟା ଅସଲି ଚାଳକଙ୍କ ସର୍କିଟ — ଦ୍ରୁତ, ବହୁଥିବା, ଆଉ ଭୁଲ କ୍ଷମା କରେ ନାହିଁ।',
     'ଏ ଟ୍ରାକ ବେଇମାନି ସହେ ନାହିଁ, ଭାଇ। ଏଠାରେ ପରିଶ୍ରମ କହେ! ଟାଳି ମାରନ୍ତୁ!'],
    ['ଗାଡ଼ିର ଶବ୍ଦ ଶୁଣନ୍ତୁ — ପୂରା ଗାଁ ପର୍ଯ୍ୟନ୍ତ ଶୁଭୁଥିବ!',
     'ଆରେ ଏ ତ ଯାତ୍ରା ପାର୍ଟିର ବାଜାଠାରୁ ବି ବେଶି ଶବ୍ଦ! କଣ କହିବି!'],
  ],
  corners: {
    'Turn 1': [
      ['ଟର୍ନ ୱାନ ପାଇଁ ଜୋରଦାର ବ୍ରେକ, ଆଉ ଟ୍ରାକ ଏଠାରୁ ଉପରକୁ ଚଢ଼େ।',
       'ଚଢ଼ାଣରେ ମୋଡ଼ିବା — ଏ ତ ପାହାଡ଼ ଉପରେ ସାଇକେଲ ଚଲାଇବା ପରି, ଭାଇ!'],
      'ଟର୍ନ ୱାନ — ଗୋଟିଏ ଲମ୍ବା ଡାହାଣ ମୋଡ଼ ଯାହା ସରିବାର ନାଁ ନିଏ ନାହିଁ।',
    ],
    'Turn 3': [
      ['ଟର୍ନ ଥ୍ରିର ଚୂଡ଼ା — ଆଗରେ କିଛି ଦେଖାଯାଏ ନାହିଁ।',
       'ଆଖି ବନ୍ଦ କରି ଭରସା! ଯେମିତି ମା ହାତର ରନ୍ଧା — ଦେଖନ୍ତୁ ନାହିଁ, ଖାଇ ଦିଅନ୍ତୁ!'],
      'ଟର୍ନ ଥ୍ରି, ଏ ପୂରା ସର୍କିଟର ସବୁଠାରୁ ଉଚ୍ଚ ଜାଗା।',
    ],
    'Turn 4': [
      'ଢାଲରୁ ତଳକୁ, ଆଉ ଟର୍ନ ଫୋର ପାଇଁ ଜୋରଦାର ବ୍ରେକ। ଲ୍ୟାପର ସବୁଠାରୁ ବଡ଼ ବ୍ରେକିଂ ଏଇଟା।',
      ['ଟର୍ନ ଫୋର — ତିନି ଶହ ମିଟରରୁ ଅଧିକ ବ୍ରେକିଂ।',
       'ଗାଡ଼ି ତଳେ ଥରୁଛି! ଯେମିତି ଫଳାଫଳ ଦିନର ପିଲା!'],
    ],
    'Turn 10': ['ଟର୍ନ ଟେନର ଲମ୍ବା ବ୍ୟାଙ୍କଡ ଡାହାଣ ମୋଡ଼ ଭିତରକୁ ପଶୁଛନ୍ତି।'],
    'Turn 11': [
      ['ଟର୍ନ ଇଲେଭେନ — ଏବେ ବି ମୋଡ଼ୁଛନ୍ତି, ଏବେ ବି ବ୍ୟାଙ୍କିଂ ଉପରେ।',
       'ଏ ମୋଡ଼ ସରୁ ନାହିଁ! ଯେମିତି ସରକାରୀ ଅଫିସର ଧାଡ଼ି!'],
      'ଏଇ ଡବଲ-ଏପେକ୍ସ ଡାହାଣ ମୋଡ଼ ହିଁ ଏ ସର୍କିଟର ଅସଲି ପରିଚୟ।',
    ],
    'Turn 16': ['ଶେଷ ମୋଡ଼, ଆଉ ସିଧା ପିଟ ଷ୍ଟ୍ରେଟ ଉପରେ।'],
  },
};

const PACKS = { en: EN, hi: HI, bho: BH, or: OD };

/** Offered on the driver-selection screen. */
export const LANGUAGES = [
  { id: 'en', label: 'ENGLISH', note: 'British broadcast pair' },
  { id: 'hi', label: 'हिंदी', note: 'Analyst + showman, full masala' },
  { id: 'bho', label: 'भोजपुरी', note: 'Stage-voice booth, maximum volume' },
  { id: 'or', label: 'ଓଡ଼ିଆ', note: 'Jatra-style booth, warm and theatrical' },
];

export class Commentary {
  constructor() {
    this.enabled = typeof speechSynthesis !== 'undefined';
    this.pack = EN;
    this.voices = [null, null];
    this.queue = [];
    this.speaking = false;
    // Set when a major call cut off the line in progress, so the booth does
    // not then pause politely before delivering it.
    this._interrupted = false;
    // Called with true/false around a run of speech, so the engine can be
    // ducked under the commentators.
    this.onSpeaking = null;
    this.idleTimer = 0;
    this.cooldown = 0;
    this.lastPosition = null;
    this.lastLap = -99;
    this.saidStart = false;
    this.wasOffTrack = false;
    this.drsCalled = 0;
    this.entry = null;
    if (this.enabled) {
      this._pickVoices();
      speechSynthesis.addEventListener?.('voiceschanged', () => this._pickVoices());
    }
  }

  /** Switch language pack. Safe to call before the voice list has loaded. */
  setLanguage(id) {
    this.pack = PACKS[id] || EN;
    if (typeof speechSynthesis !== 'undefined') this._pickVoices();
  }

  /**
   * Resolve a voice for each commentator. The two must not end up as the same
   * voice while the machine has any alternative, otherwise the exchange sounds
   * like one man talking to himself — but a voice for the wrong script is worse
   * than a repeated one, because a Devanagari line handed to an English voice is
   * simply read as silence. So the search never leaves the pack's language.
   */
  _pickVoices() {
    const all = speechSynthesis.getVoices();
    if (!all.length) return;
    const base = this.pack.code.split('-')[0];
    const usable = (v) => v.lang.replace('_', '-').startsWith(base);
    const inLang = all.filter(usable);
    const byName = (names) =>
      names.map((n) => all.find((v) => v.name.includes(n) && usable(v))).find(Boolean);

    const lead = byName(this.pack.voices[0]) || inLang[0] || all[0];
    const colour =
      byName(this.pack.voices[1]) ||
      inLang.find((v) => v !== lead) ||
      lead;

    this.voices = [lead, colour];
  }

  setDriver(entry) {
    this.entry = entry;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on && typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
      this.queue.length = 0;
      this.speaking = false;
      this.onSpeaking?.(false);
    }
  }

  /**
   * @param line   a string (the lead alone) or an array read as an exchange,
   *               with the speaker alternating from the lead
   * @param prio   0 filler, 1 normal, 2 major (a pass, the flag) — a higher
   *               priority line cuts the queue and can interrupt filler
   * @param mood   0 calm .. 1 excited; drives rate and pitch
   *
   * Live commentary is worthless if it arrives late, so every queued line
   * carries an expiry. A speech synthesiser takes seconds to read a sentence,
   * and anything waiting behind it is describing a moment that has already
   * gone. Rather than let the booth fall further and further behind the race,
   * stale lines are simply dropped on the way out of the queue — see `_drain`.
   */
  say(line, prio = 1, mood = 0.35) {
    if (!this.enabled || !line) return;
    const now = performance.now() / 1000;

    if (prio === 2) {
      // Something big happened. Cut whatever is being said unless it is also
      // a major call, and bin everything still waiting: it is all out of date.
      this.queue = this.queue.filter((q) => q.prio === 2);
      if (this.speaking && this.currentPrio < 2) {
        this._interrupted = true;
        speechSynthesis.cancel();
      }
    } else {
      // Filler and routine calls never wait behind anything. If the booth is
      // busy the moment has passed, so the line is dropped rather than stacked.
      if (this.speaking || this.queue.length) return;
    }

    const parts = Array.isArray(line) ? line : [line];
    // How long this line stays relevant. A crash call is worth hearing a beat
    // late; an idle observation about the scenery is not worth hearing at all.
    const ttl = prio === 2 ? 5 : prio === 1 ? 3 : 1.5;
    parts.forEach((text, i) => {
      // The reply is the punchline, so it comes in hotter than the call. It is
      // also the first thing sacrificed: the reply's expiry is measured from
      // the same instant, so a slow lead line takes the reply down with it.
      this.queue.push({
        text,
        prio,
        who: i % 2,
        mood: i % 2 ? Math.min(1, mood + 0.2) : mood,
        expires: now + ttl + i * 4,
      });
    });
    this._drain();
  }

  _drain() {
    if (this.speaking || !this.enabled) return;

    // Throw away anything the race has already overtaken.
    const now = performance.now() / 1000;
    while (this.queue.length && this.queue[0].expires < now) this.queue.shift();

    if (!this.queue.length) {
      this.onSpeaking?.(false);
      return;
    }

    const item = this.queue.shift();
    const voice = this.voices[item.who] || this.voices[0];
    // Some packs are written in one script and spoken in another — see `OD`.
    const text = this.pack.render ? this.pack.render(item.text) : item.text;
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || this.pack.code;

    // Per-speaker delivery. `pitch` is used when the resolved voice is already
    // the right gender for the character; `pitchAlt` when it is not, which is
    // routine for the Indian packs because most platforms ship only a female
    // Hindi voice and both of those commentators are men.
    const profile = (this.pack.voice || EN.voice)[item.who];
    const male = (this.pack.male || []).some((n) => voice?.name.includes(n));
    const solo = this.voices[0] === this.voices[1];
    u.rate = profile.rate + item.mood * 0.3;
    u.pitch = Math.max(0.1, (male ? profile.pitch : profile.pitchAlt) + item.mood * 0.2);
    // Sharing one voice between two people needs a wider split to still read
    // as two people at all.
    if (solo && item.who === 1) u.pitch = Math.max(0.1, u.pitch - 0.18);
    u.volume = 1;
    this.speaking = true;
    this.currentPrio = item.prio;
    this.onSpeaking?.(true);
    const done = () => {
      this.speaking = false;
      // A reply follows its call immediately. After a finished thought the
      // booth takes a beat — but only a short one, because a long silence is
      // what lets the race run away from the commentary.
      const interrupted = this._interrupted;
      this._interrupted = false;
      this.cooldown = interrupted ? 0 : this.queue.length ? 0.05 : 0.3;
      this._drain();
    };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  }

  /* ---------------------------------------------------------------- */
  /* Event hooks                                                       */
  /* ---------------------------------------------------------------- */

  gridFormed(entry, position) {
    const p = this.pack;
    this.say(pick(p.grid(entry.name, entry.teamName, position, p.ord)), 1, 0.3);
  }

  /** Read over the pre-race montage. */
  intro() {
    this.say(pick(this.pack.intro), 2, 0.4);
  }

  lightsOut() {
    this.saidStart = true;
    this.say(pick(this.pack.lightsOut), 2, 1);
  }

  finished(position, total) {
    const p = this.pack;
    this.say(pick(p.finish(position, total, p.ord)), 2, 0.9);
  }

  /* ---------------------------------------------------------------- */
  /* Per-frame state watching                                          */
  /* ---------------------------------------------------------------- */

  update(dt, ctx) {
    if (!this.enabled) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.idleTimer += dt;
    if (!ctx.racing || !ctx.standing) return;

    const p = this.pack;
    const st = ctx.standing;

    /* --- the player's own position ---------------------------------- */
    if (this.lastPosition == null) this.lastPosition = st.position;
    if (st.position !== this.lastPosition) {
      const gained = st.position < this.lastPosition;
      if (st.position === 1 && gained) this.say(pick(p.tookLead), 2, 1);
      else if (gained) this.say(pick(p.gained(st.position, p.ord)), 2, 0.95);
      else this.say(pick(p.lost(st.position, p.ord)), 2, 0.7);
      this.lastPosition = st.position;
      this.idleTimer = 0;
      return;
    }

    /* --- lap milestones -------------------------------------------- */
    if (ctx.raceLap !== this.lastLap && ctx.raceLap >= 0) {
      this.lastLap = ctx.raceLap;
      const remaining = ctx.totalLaps - ctx.raceLap;
      if (remaining === 1) {
        this.say(pick(p.lastLap), 2, 0.9);
      } else if (remaining > 0 && ctx.raceLap > 0) {
        this.say(pick(p.lapStart(ctx.raceLap + 1, ctx.totalLaps, st.position, p.ord)), 1, 0.45);
      }
      this.idleTimer = 0;
      return;
    }

    /* --- the player's mistakes -------------------------------------- */
    // Deliberately ahead of the cooldown gate. An off or a shunt is the one
    // thing the booth must never miss, so it interrupts whatever is being
    // said rather than waiting its turn and arriving after the recovery.
    if (ctx.offTrack && !this.wasOffTrack) {
      this.wasOffTrack = true;
      this.say(pick(p.offTrack), 2, 0.85);
      this.idleTimer = 0;
      return;
    }
    if (!ctx.offTrack) this.wasOffTrack = false;

    if (ctx.wallHit > 0.4) {
      this.say(pick(p.wall), 2, 1);
      this.idleTimer = 0;
      return;
    }

    if (this.cooldown > 0 || this.speaking) return;

    /* --- the player closing on the car in front --------------------- */
    if (st.ahead && st.ahead.gap < 1.1 && ctx.drsAvailable && this.drsCalled <= 0) {
      this.drsCalled = 12;
      this.say(pick(p.drs), 1, 0.75);
      this.idleTimer = 0;
      return;
    }
    this.drsCalled -= dt;

    /* --- colour ------------------------------------------------------ */
    if (this.idleTimer > 14) {
      this.idleTimer = 0;
      const cornerLines = p.corners[ctx.cornerName];
      if (cornerLines && Math.random() < 0.5) this.say(pick(cornerLines), 0, 0.4);
      else this.say(pick(p.idle), 0, 0.3);
    }
  }
}
