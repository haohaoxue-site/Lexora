/**
 * 通用实体头像属性。
 */
export interface EntityAvatarProps {
  /**
   * 名称
   * @description 用于回退首字符与默认 alt。
   */
  name: string
  /**
   * 图片地址
   * @description 为空时展示首字符回退。
   */
  src?: string | null
  /**
   * 替代文本
   * @description 未传时使用名称生成。
   */
  alt?: string
  /**
   * 尺寸
   * @description 数字按像素处理。
   */
  size?: number | string
  /**
   * 形状
   * @description 用户默认圆形，空间默认圆角方形。
   */
  shape?: 'circle' | 'rounded'
  /**
   * 实体类型
   * @description 控制默认背景风格。
   */
  kind?: 'user' | 'workspace'
}
