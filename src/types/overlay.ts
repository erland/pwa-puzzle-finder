export type CameraStatus = 'idle' | 'starting' | 'live' | 'captured' | 'error';

export type OverlayOptions = {
  showGrid: boolean;
  showCrosshair: boolean;
  showStatusChip: boolean;
  showDebugText: boolean;
  showContours: boolean;
  showBBoxes: boolean;
  showLabels: boolean;
  labelMode: 'id' | 'id+class' | 'class';
  opacity: number; // 0..1
  lineWidth: number;
  useClassificationColors: boolean;
};
