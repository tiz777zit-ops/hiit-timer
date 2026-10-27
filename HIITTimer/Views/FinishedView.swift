import SwiftUI

struct FinishedView: View {
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            Text("完了")
                .font(.system(size: 64, weight: .bold, design: .rounded))
            Spacer()
            Button("設定に戻る", action: onDone)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.bottom, 32)
        }
        .padding()
    }
}

#Preview {
    FinishedView {}
}
