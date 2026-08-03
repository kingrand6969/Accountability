import { StyleSheet, View } from 'react-native';

export function EditorialBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.paper} />
      <View style={[styles.contour, styles.contourOne]} />
      <View style={[styles.contour, styles.contourTwo]} />
      <View style={[styles.contour, styles.contourThree]} />
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#F7F4EC' },
  contour: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(125,105,72,0.075)',
    borderRadius: 999,
    transform: [{ rotate: '-18deg' }],
  },
  contourOne: { width: 360, height: 140, top: 118, right: -168 },
  contourTwo: { width: 430, height: 180, top: 350, left: -248 },
  contourThree: { width: 300, height: 120, bottom: 80, right: -148 },
});
