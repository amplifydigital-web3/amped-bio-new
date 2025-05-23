import { BackgroundPicker } from "./BackgroundPicker";
import { ButtonStylePicker } from "./ButtonStylePicker";
import { ContainerStylePicker } from "./ContainerStylePicker";
import { FontPicker } from "./FontPicker";
import { useEditorStore } from "../../../store/editorStore";

export function AppearancePanel() {
  const theme = useEditorStore(state => state.theme.config);
  const themeId = useEditorStore(state => state.theme.id);
  const updateThemeConfig = useEditorStore(state => state.updateThemeConfig);
  const setBackground = useEditorStore(state => state.setBackground);

  // Set default values for undefined properties
  const containerStyle = theme.containerStyle ?? 9;
  const transparency = theme.transparency ?? 100;
  const containerColor = theme.containerColor ?? "#ffffff";
  const buttonStyle = theme.buttonStyle ?? 1;
  const buttonColor = theme.buttonColor ?? "#3b82f6";
  const fontFamily = theme.fontFamily ?? "Inter";
  const fontSize = theme.fontSize ?? "16px";
  const fontColor = theme.fontColor ?? "#000000";

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Appearance</h2>
        <p className="text-sm text-gray-500">Customize the look and feel of your profile</p>
      </div>

      <BackgroundPicker value={theme.background} onChange={setBackground} themeId={themeId} />

      <ContainerStylePicker
        value={containerStyle}
        transparency={transparency}
        containerColor={containerColor}
        onChange={style => updateThemeConfig({ containerStyle: style })}
        onTransparencyChange={transparency => updateThemeConfig({ transparency })}
        onColorChange={color => updateThemeConfig({ containerColor: color })}
      />

      <ButtonStylePicker
        style={buttonStyle}
        color={buttonColor}
        onButtonStyleChange={style => updateThemeConfig({ buttonStyle: style })}
        onButtonColorChange={color => updateThemeConfig({ buttonColor: color })}
      />

      <FontPicker
        font={fontFamily}
        size={fontSize}
        color={fontColor}
        onFontChange={font => updateThemeConfig({ fontFamily: font })}
        onSizeChange={size => updateThemeConfig({ fontSize: size })}
        onColorChange={color => updateThemeConfig({ fontColor: color })}
      />
    </div>
  );
}
