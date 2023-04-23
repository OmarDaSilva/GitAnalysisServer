export default function colourFilePicker(index) {
    const colorDictionary = {
      0: 'Orange',
      1: 'LimeGreen',
      2: 'HotPink',
      3: 'BlueViolet',
      4: 'Aqua',
      5: 'Gold',
      6: 'Chocolate',
      7: 'GreenYellow',
      8: 'OrangeRed',
      9: 'MediumOrchid',
    };
  
    let colour = index % 10;
    return colorDictionary[colour];
  }