import { BackgroundPicker } from "../appearance/BackgroundPicker";
import { ButtonStylePicker } from "../appearance/ButtonStylePicker";
import { ContainerStylePicker } from "../appearance/ContainerStylePicker";
import { FontPicker } from "../appearance/FontPicker";
import { useEditor } from "../../../contexts/EditorContext";
import { AlertTriangle } from "lucide-react";

export function AppearanceTabContent() {
  const { theme, updateThemeConfig, setBackground } = useEditor();
  const themeConfig = theme.config;
  const themeId = theme.id;

  // Check if theme is not customizable (admin theme)
  const isNotCustomizable = theme.user_id === null;

  // Set default values for undefined properties
  const containerStyle = themeConfig.containerStyle ?? 9;
  const transparency = themeConfig.transparency ?? 100;
  const containerColor = themeConfig.containerColor ?? "#ffffff";
  const buttonStyle = themeConfig.buttonStyle ?? 1;
  const buttonColor = themeConfig.buttonColor ?? "#3b82f6";
  const fontFamily = themeConfig.fontFamily ?? "Inter";
  const fontSize = themeConfig.fontSize ?? "16px";
  const fontColor = themeConfig.fontColor ?? "#000000";

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Appearance</h2>
        <p className="text-sm text-gray-500">Customize the look and feel of your profile</p>
      </div>

      {isNotCustomizable ? (
        <div className="flex items-center space-x-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-medium text-orange-800">Theme Not Customizable</h3>
            <p className="text-sm text-orange-700">
              This admin theme cannot be customized. Choose a different theme to access appearance
              options.
            </p>
          </div>
        </div>
      ) : (
        <>
          <BackgroundPicker
            value={themeConfig.background}
            onChange={setBackground}
            themeId={themeId}
          />

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
        </>
      )}
    </div>
  );
}