import { BackgroundPicker } from './BackgroundPicker';
import { ButtonStylePicker } from './ButtonStylePicker';
import { ContainerStylePicker } from './ContainerStylePicker';
import { FontPicker } from './FontPicker';
import { useEditorStore } from '../../../store/editorStore';

export function AppearancePanel() {
  const theme = useEditorStore((state) => state.theme.config);
  const updateThemeConfig = useEditorStore((state) => state.updateThemeConfig);
  const setBackground = useEditorStore((state) => state.setBackground);

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Appearance</h2>
        <p className="text-sm text-gray-500">
          Customize the look and feel of your profile
        </p>
      </div>

      <BackgroundPicker
        value={theme.background}
        onChange={setBackground}
      />

      <ContainerStylePicker
        value={theme.containerStyle}
        transparency={theme.transparency}
        containerColor={theme.containerColor}
        onChange={(style) => updateThemeConfig({ containerStyle: style })}
        onTransparencyChange={(transparency) => updateThemeConfig({ transparency })}
        onColorChange={(color) => updateThemeConfig({ containerColor: color })}
      />

      <ButtonStylePicker
        style={theme.buttonStyle}
        color={theme.buttonColor}
        onButtonStyleChange={(style) => updateThemeConfig({ buttonStyle: style })}
        onButtonColorChange={(color) => updateThemeConfig({ buttonColor: color })}
      />

      <FontPicker
        font={theme.fontFamily}
        size={theme.fontSize}
        color={theme.fontColor}
        onFontChange={(font) => updateThemeConfig({ fontFamily: font })}
        onSizeChange={(size) => updateThemeConfig({ fontSize: size })}
        onColorChange={(color) => updateThemeConfig({ fontColor: color })}
      />
    </div>
  );
}