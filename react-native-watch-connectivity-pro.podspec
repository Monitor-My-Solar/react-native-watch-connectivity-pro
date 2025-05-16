require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-watch-connectivity-pro"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "11.0" }
  s.source       = { :git => "https://github.com/Monitor-My-Solar/react-native-watch-connectivity-pro.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"

  s.dependency "React-Core"

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "SWIFT_COMPILATION_MODE" => "wholemodule"
  }
end 