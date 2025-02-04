import { BackgroundPicker } from './BackgroundPicker';
import { ButtonStylePicker } from './ButtonStylePicker';
import { ContainerStylePicker } from './ContainerStylePicker';
import { ColorPicker } from './ColorPicker';
import { FontPicker } from './FontPicker';
import { useEditorStore } from '../../../store/editorStore';

export function AppearancePanel() {
  const theme = useEditorStore((state) => state.theme.config);
  const updateThemeConfig = useEditorStore((state) => state.updateThemeConfig);
  const setBackground = useEditorStore((state) => state.setBackground);

  return (
    <div className="p-6 space-y-8">
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
        value={theme.buttonStyle}
        onChange={(style) => updateThemeConfig({ buttonStyle: style })}
      />

      <ColorPicker
        label="Button Color"
        value={theme.buttonColor}
        onChange={(color) => updateThemeConfig({ buttonColor: color })}
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